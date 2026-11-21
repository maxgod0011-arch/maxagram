import { useEffect, useRef } from 'react';
import type { RealtimeEvent } from '../../shared/types';
import { getStoredUserToken } from './api';

const MAX_RECONNECT_ATTEMPTS = 5;

export function useSocialRealtime(
  enabled: boolean,
  onEvent: (event: RealtimeEvent) => void
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let attempts = 0;

    function clearTimers() {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (pingTimer !== null) {
        window.clearInterval(pingTimer);
        pingTimer = null;
      }
    }

    function connect() {
      if (disposed) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getStoredUserToken();
      const qs = token ? `?token=${encodeURIComponent(token)}` : '';
      const wsUrl = `${protocol}//${window.location.host}/ws/social${qs}`;

      try {
        socket = new WebSocket(wsUrl);
      } catch {
        return;
      }

      socket.onopen = () => {
        attempts = 0;
        clearTimers();
        pingTimer = window.setInterval(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as RealtimeEvent | { type: 'pong' };
          if (!parsed || parsed.type === 'pong') return;
          onEventRef.current(parsed as RealtimeEvent);
        } catch {
          // Ignore non-JSON frames
        }
      };

      socket.onclose = () => {
        clearTimers();
        if (disposed) return;
        if (attempts >= MAX_RECONNECT_ATTEMPTS) return;
        const delayMs = Math.min(15000, 1500 * Math.pow(2, attempts));
        attempts += 1;
        reconnectTimer = window.setTimeout(connect, delayMs);
      };

      socket.onerror = () => {
        // Error triggers onclose; keep silent for graceful serverless fallback
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimers();
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
        socket = null;
      }
    };
  }, [enabled]);
}
