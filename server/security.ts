import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DeviceSignals } from '../shared/types.ts';

export const OFFICIAL_REGISTRATION_CODE = 'PRE-REWORD';

export const USER_SESSION_COOKIE = 'maxagram_user_session';
export const ADMIN_SESSION_COOKIE = 'maxagram_admin_session';

export interface UserTokenPayload {
  type: 'user';
  regId: string;
  deviceFingerprint: string;
  iat: number;
  exp: number;
}

export interface AdminTokenPayload {
  type: 'admin';
  adminId: string;
  email: string;
  iat: number;
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, originalHex] = parts;
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHex, 'hex');
  if (derivedBuf.length !== originalBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedBuf, originalBuf);
}

export function hashSecretValue(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export function generateRecoveryKey(): string {
  const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `REC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export function generateSha256FromText(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(3, local.length - 2))}@${domain}`;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

export function computeServerDeviceFingerprint(
  req: Request,
  signals: Partial<DeviceSignals> | undefined,
  secret: string
): { fingerprint: string; shortId: string; platform: string; browser: string } {
  const ua = (req.headers['user-agent'] || 'unknown-ua').slice(0, 220);
  const acceptLang = (req.headers['accept-language'] || 'en').split(',')[0].trim().toLowerCase();
  const clientHash =
    typeof signals?.clientHash === 'string' && signals.clientHash.length >= 16
      ? signals.clientHash.slice(0, 128)
      : 'no-client-hash';
  const screen = typeof signals?.screen === 'string' ? signals.screen.slice(0, 40) : 'unknown';
  const timezone = typeof signals?.timezone === 'string' ? signals.timezone.slice(0, 64) : 'UTC';
  const platform =
    typeof signals?.platform === 'string' && signals.platform.trim().length > 0
      ? signals.platform.trim().slice(0, 48)
      : inferPlatformFromUA(ua);
  const browser =
    typeof signals?.browser === 'string' && signals.browser.trim().length > 0
      ? signals.browser.trim().slice(0, 48)
      : inferBrowserFromUA(ua);

  const canonical = `${clientHash}|${platform}|${screen}|${timezone}|${acceptLang}|${normalizeUA(ua)}`;
  const fingerprint = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  const shortId = `DEV-${fingerprint.slice(0, 4).toUpperCase()}-${fingerprint.slice(4, 8).toUpperCase()}`;

  return { fingerprint, shortId, platform, browser };
}

function normalizeUA(ua: string): string {
  // Strip volatile minor build numbers while preserving browser family and OS family
  return ua.replace(/\d+\.\d+\.\d+(\.\d+)?/g, 'X').toLowerCase();
}

function inferPlatformFromUA(ua: string): string {
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iOS/i.test(ua)) return 'iOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Desktop';
}

function inferBrowserFromUA(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Microsoft Edge';
  if (/Firefox\//i.test(ua)) return 'Mozilla Firefox';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Google Chrome';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Apple Safari';
  return 'Web Browser';
}

export function signToken<T extends UserTokenPayload | AdminTokenPayload>(
  payload: T,
  secret: string
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyToken<T extends UserTokenPayload | AdminTokenPayload>(
  token: string | undefined,
  secret: string,
  expectedType: T['type']
): T | null {
  if (!token || !token.includes('.')) return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as T;
    if (parsed.type !== expectedType) return null;
    if (typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

export function isHttpsRequest(req: Request): boolean {
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    return proto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return req.secure;
}

export function setAuthCookie(
  req: Request,
  res: Response,
  name: string,
  value: string,
  maxAgeSeconds: number
): void {
  const secure = isHttpsRequest(req);
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (secure) {
    parts.push('Secure');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function clearAuthCookie(req: Request, res: Response, name: string): void {
  const secure = isHttpsRequest(req);
  const parts = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    secure ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (secure) {
    parts.push('Secure');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function extractBearerOrCookie(
  req: Request,
  cookieName: string,
  headerName: 'authorization' | 'x-admin-token' = 'authorization'
): string | undefined {
  if (headerName === 'authorization') {
    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice(7).trim();
    }
  } else {
    const custom = req.headers['x-admin-token'];
    if (typeof custom === 'string' && custom.trim().length > 0) {
      return custom.trim();
    }
  }
  const cookies = parseCookies(req);
  return cookies[cookieName];
}

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isHttpsRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

interface RateBucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message: string;
}) {
  const buckets = new Map<string, RateBucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${getClientIp(req)}:${req.baseUrl}${req.path}`;
    const existing = buckets.get(key);

    if (!existing || now > existing.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      if (buckets.size > 5000) {
        for (const [k, v] of buckets.entries()) {
          if (now > v.resetAt) buckets.delete(k);
        }
      }
      next();
      return;
    }

    if (existing.count >= options.maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: options.message,
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    existing.count += 1;
    next();
  };
}
