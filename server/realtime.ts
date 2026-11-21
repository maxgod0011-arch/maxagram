import type http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { RealtimeEvent } from '../shared/types.ts';
import { db } from './database.ts';
import { USER_SESSION_COOKIE, verifyToken } from './security.ts';
import type { UserTokenPayload } from './security.ts';

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

class SocialRealtimeHub {
  private socketsByUser = new Map<string, Set<WebSocket>>();
  private wss: WebSocketServer | null = null;

  public attach(httpServer: http.Server): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws/social' });

    this.wss.on('connection', (socket, req) => {
      const requestUrl = new URL(req.url || '/ws/social', 'http://localhost');
      const queryToken = requestUrl.searchParams.get('token') || undefined;
      const cookies = parseCookieHeader(req.headers.cookie);
      const token = queryToken || cookies[USER_SESSION_COOKIE];

      const decoded = verifyToken<UserTokenPayload>(token, db.getSessionSecret(), 'user');
      if (!decoded) {
        socket.close(4401, 'Unauthorized');
        return;
      }

      const record = db.findRegistrationById(decoded.regId);
      if (!record || record.status !== 'ACTIVE' || record.deviceResetRequired) {
        socket.close(4403, 'Forbidden');
        return;
      }

      const userId = record.id;
      let userSet = this.socketsByUser.get(userId);
      if (!userSet) {
        userSet = new Set();
        this.socketsByUser.set(userId, userSet);
      }
      userSet.add(socket);

      // Broadcast updated real online presence
      this.broadcastPresence();

      socket.on('message', (raw) => {
        // Lightweight ping/pong keepalive support
        try {
          const parsed = JSON.parse(String(raw)) as { type?: string };
          if (parsed?.type === 'ping' && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
          }
        } catch {
          // Ignore malformed client frames
        }
      });

      socket.on('close', () => {
        const set = this.socketsByUser.get(userId);
        if (set) {
          set.delete(socket);
          if (set.size === 0) {
            this.socketsByUser.delete(userId);
          }
        }
        this.broadcastPresence();
      });

      socket.on('error', () => {
        socket.terminate();
      });
    });
  }

  public getOnlineUserIds(): string[] {
    return Array.from(this.socketsByUser.keys());
  }

  public isUserOnline(userId: string): boolean {
    const set = this.socketsByUser.get(userId);
    return Boolean(set && set.size > 0);
  }

  public broadcastPresence(): void {
    this.broadcastToAll({
      type: 'presence:update',
      onlineUserIds: this.getOnlineUserIds(),
    });
  }

  public broadcastToAll(event: RealtimeEvent): void {
    const payload = JSON.stringify(event);
    for (const sockets of this.socketsByUser.values()) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  }

  public sendToUsers(userIds: string[], event: RealtimeEvent): void {
    const payload = JSON.stringify(event);
    const unique = new Set(userIds);
    for (const userId of unique) {
      const sockets = this.socketsByUser.get(userId);
      if (!sockets) continue;
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  }
}

export const socialHub = new SocialRealtimeHub();
