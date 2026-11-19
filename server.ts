import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { DOWNLOAD_CATEGORIES } from './shared/types.ts';
import type {
  DeviceCheckResponse,
  DeviceSignals,
  DownloadCategory,
  DownloadFormPayload,
} from './shared/types.ts';
import { db } from './server/database.ts';
import {
  ADMIN_SESSION_COOKIE,
  OFFICIAL_REGISTRATION_CODE,
  USER_SESSION_COOKIE,
  clearAuthCookie,
  computeServerDeviceFingerprint,
  createRateLimiter,
  extractBearerOrCookie,
  getClientIp,
  maskEmail,
  securityHeadersMiddleware,
  setAuthCookie,
  signToken,
  verifyToken,
} from './server/security.ts';
import type { AdminTokenPayload, UserTokenPayload } from './server/security.ts';
import { buildZipArchive } from './server/zip.ts';

interface AuthenticatedRequest extends Request {
  registrationId?: string;
  deviceFingerprint?: string;
  adminId?: string;
}

const PORT = Number(process.env.PORT || 3000);
const USER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

const app = express();
app.set('trust proxy', 1);
app.use(securityHeadersMiddleware);
app.use(express.json({ limit: '1mb' }));

const generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 240,
  message: 'Too many requests from this network. Please slow down and try again shortly.',
});

const authStrictLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 25,
  message: 'Too many authentication attempts. Please wait a few minutes before retrying.',
});

app.use('/api', generalApiLimiter);

function parseDeviceSignalsHeader(req: Request): Partial<DeviceSignals> {
  const raw = req.headers['x-device-signals'];
  if (typeof raw === 'string' && raw.length > 0 && raw.length < 1500) {
    try {
      return JSON.parse(raw) as Partial<DeviceSignals>;
    } catch {
      return {};
    }
  }
  return {};
}

function issueUserSession(
  req: Request,
  res: Response,
  regId: string,
  deviceFingerprint: string
): string {
  const now = Date.now();
  const payload: UserTokenPayload = {
    type: 'user',
    regId,
    deviceFingerprint,
    iat: now,
    exp: now + USER_SESSION_TTL_MS,
  };
  const token = signToken(payload, db.getSessionSecret());
  setAuthCookie(req, res, USER_SESSION_COOKIE, token, Math.floor(USER_SESSION_TTL_MS / 1000));
  return token;
}

function requireRegisteredUser(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerOrCookie(req, USER_SESSION_COOKIE, 'authorization');
  const decoded = verifyToken<UserTokenPayload>(token, db.getSessionSecret(), 'user');
  if (!decoded) {
    res.status(401).json({
      error: 'Registration verification required to access MAXAGRAM downloads.',
      code: 'REGISTRATION_REQUIRED',
    });
    return;
  }

  const record = db.findRegistrationById(decoded.regId);
  if (!record) {
    clearAuthCookie(req, res, USER_SESSION_COOKIE);
    res.status(401).json({
      error: 'Registration record no longer exists. Please register or contact support.',
      code: 'REGISTRATION_NOT_FOUND',
    });
    return;
  }

  if (record.status !== 'ACTIVE') {
    res.status(403).json({
      error: 'Your MAXAGRAM registration has been disabled by an administrator.',
      code: 'REGISTRATION_DISABLED',
    });
    return;
  }

  if (record.deviceResetRequired || record.deviceFingerprint !== decoded.deviceFingerprint) {
    clearAuthCookie(req, res, USER_SESSION_COOKIE);
    res.status(403).json({
      error: 'Device binding mismatch. Please complete admin-approved device recovery.',
      code: 'DEVICE_MISMATCH',
    });
    return;
  }

  // If the client also sent hardware signals header, enforce live server-side device match
  const headerSignals = parseDeviceSignalsHeader(req);
  if (headerSignals.clientHash) {
    const computed = computeServerDeviceFingerprint(req, headerSignals, db.getSessionSecret());
    if (computed.fingerprint !== record.deviceFingerprint) {
      res.status(403).json({
        error: 'This session is bound to a different device.',
        code: 'DEVICE_MISMATCH',
      });
      return;
    }
  }

  req.registrationId = record.id;
  req.deviceFingerprint = record.deviceFingerprint;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerOrCookie(req, ADMIN_SESSION_COOKIE, 'x-admin-token');
  const decoded = verifyToken<AdminTokenPayload>(token, db.getSessionSecret(), 'admin');
  if (!decoded) {
    res.status(401).json({ error: 'Administrator authentication required.' });
    return;
  }

  const admin = db.findAdminById(decoded.adminId);
  if (!admin) {
    clearAuthCookie(req, res, ADMIN_SESSION_COOKIE);
    res.status(401).json({ error: 'Administrator session is invalid.' });
    return;
  }

  req.adminId = admin.id;
  next();
}

// ============================================================================
// PUBLIC REGISTRATION & DEVICE VERIFICATION ROUTES
// ============================================================================

app.post('/api/auth/device-check', (req: Request, res: Response) => {
  const signals = (req.body?.signals || {}) as Partial<DeviceSignals>;
  const computed = computeServerDeviceFingerprint(req, signals, db.getSessionSecret());
  const registrationsEnabled = db.isRegistrationsEnabled();

  // 1. Check active signed session token first
  const token = extractBearerOrCookie(req, USER_SESSION_COOKIE, 'authorization');
  const decoded = verifyToken<UserTokenPayload>(token, db.getSessionSecret(), 'user');

  if (decoded) {
    const record = db.findRegistrationById(decoded.regId);
    if (record) {
      if (record.status !== 'ACTIVE') {
        const payload: DeviceCheckResponse = {
          registered: false,
          status: 'DISABLED',
          registrationsEnabled,
          deviceIdPreview: record.deviceShortId,
          deviceAlreadyRegistered: true,
          maskedEmail: maskEmail(record.email),
          message: 'Your registration has been disabled by an administrator.',
        };
        res.json(payload);
        return;
      }

      if (record.deviceResetRequired || record.deviceFingerprint !== computed.fingerprint) {
        clearAuthCookie(req, res, USER_SESSION_COOKIE);
        const payload: DeviceCheckResponse = {
          registered: false,
          status: 'DEVICE_MISMATCH',
          registrationsEnabled,
          deviceIdPreview: computed.shortId,
          deviceAlreadyRegistered: false,
          maskedEmail: maskEmail(record.email),
          recoveryPending: Boolean(record.recoveryCodeHash),
          message:
            'Your account requires device recovery before signing in on this device. Contact an administrator for a one-time recovery key.',
        };
        res.json(payload);
        return;
      }

      db.touchVerification(record.id, getClientIp(req));
      const freshToken = issueUserSession(req, res, record.id, record.deviceFingerprint);
      const payload: DeviceCheckResponse = {
        registered: true,
        status: 'ACTIVE',
        registrationsEnabled,
        deviceIdPreview: record.deviceShortId,
        deviceAlreadyRegistered: true,
        registration: db.toPublicRegistration(record),
        token: freshToken,
      };
      res.json(payload);
      return;
    }
  }

  // 2. No active session token: verify hardware/server device fingerprint in database
  // Prevents bypassing or duplicate re-registration after clearing browser cookies/localStorage
  const existingByDevice = db.findRegistrationByDeviceFingerprint(computed.fingerprint);
  if (existingByDevice) {
    if (existingByDevice.status !== 'ACTIVE') {
      const payload: DeviceCheckResponse = {
        registered: false,
        status: 'DISABLED',
        registrationsEnabled,
        deviceIdPreview: existingByDevice.deviceShortId,
        deviceAlreadyRegistered: true,
        maskedEmail: maskEmail(existingByDevice.email),
        message: 'Access for this device has been disabled by an administrator.',
      };
      res.json(payload);
      return;
    }

    const payload: DeviceCheckResponse = {
      registered: false,
      status: 'SESSION_CLEARED_DEVICE_BOUND',
      registrationsEnabled,
      deviceIdPreview: existingByDevice.deviceShortId,
      deviceAlreadyRegistered: true,
      maskedEmail: maskEmail(existingByDevice.email),
      recoveryPending: Boolean(existingByDevice.recoveryCodeHash),
      message:
        'This device has already completed one-time registration. Duplicate registration is blocked; use Device Recovery with your registered email to restore access.',
    };
    res.json(payload);
    return;
  }

  const payload: DeviceCheckResponse = {
    registered: false,
    status: 'UNREGISTERED',
    registrationsEnabled,
    deviceIdPreview: computed.shortId,
    deviceAlreadyRegistered: false,
  };
  res.json(payload);
});

app.post('/api/auth/register', authStrictLimiter, (req: Request, res: Response) => {
  if (!db.isRegistrationsEnabled()) {
    res.status(403).json({
      error: 'New registrations are currently paused by the MAXAGRAM administrator.',
    });
    return;
  }

  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const registrationCode =
    typeof req.body?.registrationCode === 'string' ? req.body.registrationCode.trim() : '';
  const signals = (req.body?.signals || {}) as Partial<DeviceSignals>;

  if (fullName.length < 2 || fullName.length > 80) {
    res.status(400).json({ error: 'Please enter your full name (2 to 80 characters).' });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email) || email.length > 120) {
    res.status(400).json({ error: 'Please enter a valid email address for device binding.' });
    return;
  }

  // Strict server-side validation of official registration code PRE-REWORD
  if (registrationCode !== OFFICIAL_REGISTRATION_CODE) {
    res.status(400).json({
      error: `Invalid registration code. Only the official code "${OFFICIAL_REGISTRATION_CODE}" is accepted.`,
    });
    return;
  }

  const computed = computeServerDeviceFingerprint(req, signals, db.getSessionSecret());

  // Enforce strict one-device, one-time rule
  const existingDevice = db.findRegistrationByDeviceFingerprint(computed.fingerprint);
  if (existingDevice) {
    res.status(409).json({
      error:
        'This device has already completed its one-time registration. Duplicate registrations are not permitted. Switch to Device Recovery to restore your verified session.',
      code: 'DUPLICATE_DEVICE',
    });
    return;
  }

  // Enforce strict one-account, non-reusable code rule
  const existingEmail = db.findRegistrationByEmail(email);
  if (existingEmail) {
    res.status(409).json({
      error:
        'This email address has already redeemed the one-time registration code. Each account may register only once; request admin device recovery if you changed devices.',
      code: 'DUPLICATE_ACCOUNT',
    });
    return;
  }

  const created = db.createRegistration({
    fullName,
    email,
    deviceFingerprint: computed.fingerprint,
    deviceShortId: computed.shortId,
    devicePlatform: computed.platform,
    deviceBrowser: computed.browser,
    ipAddress: getClientIp(req),
  });

  const token = issueUserSession(req, res, created.id, created.deviceFingerprint);

  res.status(201).json({
    success: true,
    message: 'Registration completed and bound to your device.',
    registration: db.toPublicRegistration(created),
    token,
  });
});

app.post('/api/auth/recover', authStrictLimiter, (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const recoveryKey = typeof req.body?.recoveryKey === 'string' ? req.body.recoveryKey.trim() : '';
  const signals = (req.body?.signals || {}) as Partial<DeviceSignals>;

  if (!email) {
    res.status(400).json({ error: 'Enter the email address associated with your registration.' });
    return;
  }

  const computed = computeServerDeviceFingerprint(req, signals, db.getSessionSecret());

  const result = db.completeDeviceRecovery({
    email,
    recoveryKey,
    currentDeviceFingerprint: computed.fingerprint,
    currentDeviceShortId: computed.shortId,
    currentPlatform: computed.platform,
    currentBrowser: computed.browser,
    ipAddress: getClientIp(req),
  });

  if (!result.ok) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }

  const token = issueUserSession(req, res, result.record.id, result.record.deviceFingerprint);

  res.json({
    success: true,
    message: 'Device verification restored. Welcome back to MAXAGRAM.',
    registration: db.toPublicRegistration(result.record),
    token,
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  clearAuthCookie(req, res, USER_SESSION_COOKIE);
  res.json({ success: true });
});

// ============================================================================
// PROTECTED DOWNLOAD CATALOG & FILE DELIVERY ROUTES
// ============================================================================

app.get('/api/catalog', requireRegisteredUser, (req: AuthenticatedRequest, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  const section = typeof req.query.section === 'string' ? req.query.section : '';

  const allItems = db.listDownloads({ q, category, section });
  const record = req.registrationId ? db.findRegistrationById(req.registrationId) : undefined;

  res.json({
    items: allItems,
    categories: DOWNLOAD_CATEGORIES,
    totalCount: allItems.length,
    registration: record ? db.toPublicRegistration(record) : null,
  });
});

app.get('/api/downloads/:id', requireRegisteredUser, (req: AuthenticatedRequest, res: Response) => {
  const item = db.getDownloadById(req.params.id);
  if (!item) {
    res.status(404).json({ error: 'Download package not found.' });
    return;
  }
  res.json({ item });
});

app.get(
  '/api/downloads/:id/file',
  requireRegisteredUser,
  (req: AuthenticatedRequest, res: Response) => {
    const item = db.getDownloadById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Requested file does not exist.' });
      return;
    }

    const registration = req.registrationId ? db.findRegistrationById(req.registrationId) : undefined;
    if (!registration) {
      res.status(401).json({ error: 'Verified registration session required.' });
      return;
    }

    const updated = db.recordDownload(item.id, registration) || item;

    const manifestJson = JSON.stringify(
      {
        platform: 'MAXAGRAM Verified Distribution',
        packageId: updated.id,
        title: updated.title,
        version: updated.version,
        category: updated.category,
        declaredSize: updated.fileSize,
        sha256: updated.sha256,
        releasedAt: updated.releasedAt,
        licensedTo: {
          account: registration.email,
          deviceId: registration.deviceShortId,
          verifiedAt: new Date().toISOString(),
        },
      },
      null,
      2
    );

    const readmeTxt = [
      '====================================================================',
      `MAXAGRAM VERIFIED RELEASE PACKAGE: ${updated.title} v${updated.version}`,
      '====================================================================',
      '',
      `Category:     ${updated.category}`,
      `Package Size: ${updated.fileSize}`,
      `Release Date: ${new Date(updated.releasedAt).toUTCString()}`,
      `SHA-256:      ${updated.sha256}`,
      `Bound Device: ${registration.deviceShortId} (${registration.email})`,
      '',
      'OVERVIEW',
      '--------',
      updated.description,
      '',
      'RELEASE NOTES',
      '-------------',
      updated.releaseNotes,
      '',
      'SYSTEM REQUIREMENTS',
      '-------------------',
      updated.requirements,
      '',
      'VERIFICATION',
      '------------',
      'This archive was dynamically sealed for your registered MAXAGRAM device.',
      'Inspect MANIFEST.json and SHA256SUMS.txt to confirm package integrity.',
      '',
    ].join('\n');

    const checksumsTxt = `${updated.sha256}  ${updated.fileName}\n`;

    const archive = buildZipArchive([
      { name: 'README.txt', content: readmeTxt },
      { name: 'MANIFEST.json', content: manifestJson },
      { name: 'SHA256SUMS.txt', content: checksumsTxt },
    ]);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${updated.fileName}"`);
    res.setHeader('Content-Length', String(archive.length));
    res.setHeader('X-Maxagram-Downloads', String(updated.downloadsCount));
    res.setHeader('Cache-Control', 'no-store');
    res.send(archive);
  }
);

// ============================================================================
// SECURE ADMINISTRATOR ROUTES
// ============================================================================

app.post('/api/admin/login', authStrictLimiter, (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Administrator email and password are required.' });
    return;
  }

  const admin = db.authenticateAdmin(email, password);
  if (!admin) {
    res.status(401).json({ error: 'Invalid administrator credentials.' });
    return;
  }

  const now = Date.now();
  const payload: AdminTokenPayload = {
    type: 'admin',
    adminId: admin.id,
    email: admin.email,
    iat: now,
    exp: now + ADMIN_SESSION_TTL_MS,
  };
  const token = signToken(payload, db.getSessionSecret());
  setAuthCookie(req, res, ADMIN_SESSION_COOKIE, token, Math.floor(ADMIN_SESSION_TTL_MS / 1000));

  res.json({
    success: true,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
    token,
  });
});

app.post('/api/admin/logout', (req: Request, res: Response) => {
  clearAuthCookie(req, res, ADMIN_SESSION_COOKIE);
  res.json({ success: true });
});

app.get('/api/admin/session', (req: Request, res: Response) => {
  const token = extractBearerOrCookie(req, ADMIN_SESSION_COOKIE, 'x-admin-token');
  const decoded = verifyToken<AdminTokenPayload>(token, db.getSessionSecret(), 'admin');
  if (!decoded) {
    res.json({ authenticated: false });
    return;
  }
  const admin = db.findAdminById(decoded.adminId);
  if (!admin) {
    res.json({ authenticated: false });
    return;
  }
  res.json({
    authenticated: true,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
  });
});

app.get('/api/admin/overview', requireAdmin, (_req: Request, res: Response) => {
  res.json(db.getAdminOverview());
});

app.patch('/api/admin/settings', requireAdmin, (req: Request, res: Response) => {
  if (typeof req.body?.registrationsEnabled !== 'boolean') {
    res.status(400).json({ error: 'registrationsEnabled boolean is required.' });
    return;
  }
  const enabled = db.setRegistrationsEnabled(req.body.registrationsEnabled);
  res.json({ registrationsEnabled: enabled });
});

app.get('/api/admin/registrations', requireAdmin, (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const status = typeof req.query.status === 'string' ? req.query.status : 'ALL';
  const registrations = db.listRegistrationsForAdmin({ q, status });
  res.json({ registrations });
});

app.patch('/api/admin/registrations/:id/status', requireAdmin, (req: Request, res: Response) => {
  const status = req.body?.status;
  if (status !== 'ACTIVE' && status !== 'DISABLED') {
    res.status(400).json({ error: 'Status must be ACTIVE or DISABLED.' });
    return;
  }
  const updated = db.updateRegistrationStatus(req.params.id, status);
  if (!updated) {
    res.status(404).json({ error: 'Registration record not found.' });
    return;
  }
  res.json({ registration: db.toPublicRegistration(updated) });
});

app.post('/api/admin/registrations/:id/recovery', requireAdmin, (req: Request, res: Response) => {
  const unbindCurrentDevice = Boolean(req.body?.unbindCurrentDevice);
  const result = db.issueDeviceRecovery(req.params.id, unbindCurrentDevice);
  if (!result) {
    res.status(404).json({ error: 'Registration record not found.' });
    return;
  }
  res.json({
    success: true,
    recoveryKey: result.recoveryKey,
    unbindCurrentDevice,
    registration: db.toPublicRegistration(result.record),
  });
});

app.delete('/api/admin/registrations/:id', requireAdmin, (req: Request, res: Response) => {
  const deleted = db.deleteRegistration(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Registration record not found.' });
    return;
  }
  res.json({ success: true });
});

app.get('/api/admin/downloads', requireAdmin, (_req: Request, res: Response) => {
  res.json({ items: db.listDownloads() });
});

function validateDownloadPayload(body: unknown): {
  valid: true;
  payload: DownloadFormPayload;
} | {
  valid: false;
  error: string;
} {
  const b = (body || {}) as Record<string, unknown>;
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const category = typeof b.category === 'string' ? (b.category as DownloadCategory) : '';
  const version = typeof b.version === 'string' ? b.version.trim() : '';
  const fileSize = typeof b.fileSize === 'string' ? b.fileSize.trim() : '';
  const fileName = typeof b.fileName === 'string' ? b.fileName.trim() : '';
  const shortDescription = typeof b.shortDescription === 'string' ? b.shortDescription.trim() : '';
  const description = typeof b.description === 'string' ? b.description.trim() : '';
  const releaseNotes = typeof b.releaseNotes === 'string' ? b.releaseNotes.trim() : '';
  const requirements = typeof b.requirements === 'string' ? b.requirements.trim() : '';
  const coverImage = typeof b.coverImage === 'string' ? b.coverImage.trim() : '';
  const featured = Boolean(b.featured);

  if (title.length < 2) return { valid: false, error: 'File title must be at least 2 characters.' };
  if (!DOWNLOAD_CATEGORIES.includes(category as DownloadCategory)) {
    return { valid: false, error: 'Please select a valid category.' };
  }
  if (!version) return { valid: false, error: 'Version number is required (e.g. 2.1.0).' };
  if (!fileSize) return { valid: false, error: 'File size is required (e.g. 120 MB).' };
  if (shortDescription.length < 8) {
    return { valid: false, error: 'Short summary must be at least 8 characters.' };
  }

  return {
    valid: true,
    payload: {
      title,
      category: category as DownloadCategory,
      version,
      fileSize,
      fileName,
      shortDescription,
      description: description || shortDescription,
      releaseNotes: releaseNotes || 'Verified release published via MAXAGRAM Admin.',
      requirements: requirements || 'Windows 10+ / macOS 13+ / Linux x64',
      coverImage,
      featured,
    },
  };
}

app.post('/api/admin/downloads', requireAdmin, (req: Request, res: Response) => {
  const check = validateDownloadPayload(req.body);
  if (!check.valid) {
    res.status(400).json({ error: check.error });
    return;
  }
  const created = db.createDownload(check.payload);
  res.status(201).json({ item: created });
});

app.put('/api/admin/downloads/:id', requireAdmin, (req: Request, res: Response) => {
  const check = validateDownloadPayload(req.body);
  if (!check.valid) {
    res.status(400).json({ error: check.error });
    return;
  }
  const updated = db.updateDownload(req.params.id, check.payload);
  if (!updated) {
    res.status(404).json({ error: 'Download package not found.' });
    return;
  }
  res.json({ item: updated });
});

app.delete('/api/admin/downloads/:id', requireAdmin, (req: Request, res: Response) => {
  const deleted = db.deleteDownload(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Download package not found.' });
    return;
  }
  res.json({ success: true });
});

// ============================================================================
// VITE DEV MIDDLEWARE / PRODUCTION STATIC HOSTING
// ============================================================================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MAXAGRAM server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MAXAGRAM server:', err);
  process.exit(1);
});
