import fs from 'node:fs';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { DOWNLOAD_CATEGORIES } from '../shared/types.ts';
import type {
  DeviceCheckResponse,
  DeviceSignals,
  DownloadCategory,
  DownloadFormPayload,
  PostMediaType,
} from '../shared/types.ts';
import { db } from './database.ts';
import { resolveUploadedMediaPath, saveUploadedMedia } from './mediaStore.ts';
import { socialHub } from './realtime.ts';
import {
  ADMIN_SESSION_COOKIE,
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
} from './security.ts';
import type { AdminTokenPayload, UserTokenPayload } from './security.ts';
import { buildZipArchive } from './zip.ts';

interface AuthenticatedRequest extends Request {
  registrationId?: string;
  deviceFingerprint?: string;
  adminId?: string;
}

const USER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

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

function validateDownloadPayload(
  body: unknown
): { valid: true; payload: DownloadFormPayload } | { valid: false; error: string } {
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

export function createApiApp(): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: '16mb' }));

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

  // Synchronize remote KV store on Vercel serverless invocations when configured
  app.use('/api', async (_req: Request, _res: Response, next: NextFunction) => {
    await db.syncFromRemote();
    next();
  });

  // ============================================================================
  // PUBLIC REGISTRATION & DEVICE VERIFICATION ROUTES
  // ============================================================================

  app.post('/api/auth/device-check', async (req: Request, res: Response) => {
    const signals = (req.body?.signals || {}) as Partial<DeviceSignals>;
    const computed = computeServerDeviceFingerprint(req, signals, db.getSessionSecret());
    const registrationsEnabled = db.isRegistrationsEnabled();

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
        await db.flushToRemote();
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

    const existingPreReg = db.findPreRegistrationByDeviceFingerprint(computed.fingerprint);
    if (existingPreReg && !existingPreReg.redeemedAt) {
      const payload: DeviceCheckResponse = {
        registered: false,
        status: 'PRE_REGISTERED',
        registrationsEnabled,
        deviceIdPreview: existingPreReg.deviceShortId,
        deviceAlreadyRegistered: false,
        maskedEmail: existingPreReg.email ? maskEmail(existingPreReg.email) : undefined,
        message:
          'Enter your copied Pre-Registration code below to unlock MAXAGRAM, or click Pre-Registration anytime to view and copy the official registration code.',
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

  app.post('/api/auth/pre-register', async (req: Request, res: Response) => {
    if (!db.isRegistrationsEnabled()) {
      res.status(403).json({
        error: 'New pre-registrations are currently paused by the MAXAGRAM administrator.',
      });
      return;
    }

    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim().slice(0, 80) : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().slice(0, 120) : '';
    const signals = (req.body?.signals || {}) as Partial<DeviceSignals>;

    const computed = computeServerDeviceFingerprint(req, signals, db.getSessionSecret());

    const created = db.createPreRegistration({
      fullName,
      email,
      deviceFingerprint: computed.fingerprint,
      deviceShortId: computed.shortId,
      devicePlatform: computed.platform,
      deviceBrowser: computed.browser,
      ipAddress: getClientIp(req),
    });

    await db.flushToRemote();

    res.status(201).json({
      success: true,
      message: 'Successfully Pre-registration! Copy this code',
      uniqueCode: created.uniqueCode,
      preRegistration: db.toPublicPreRegistration(created),
    });
  });

  app.post('/api/auth/register', authStrictLimiter, async (req: Request, res: Response) => {
    if (!db.isRegistrationsEnabled()) {
      res.status(403).json({
        error: 'New registrations are currently paused by the MAXAGRAM administrator.',
      });
      return;
    }

    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim().slice(0, 80) : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const registrationCode =
      typeof req.body?.registrationCode === 'string' ? req.body.registrationCode.trim() : '';
    const signals = (req.body?.signals || {}) as Partial<DeviceSignals>;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.length > 120) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    if (registrationCode.length < 6) {
      res.status(400).json({
        error: 'Enter the code you copied after clicking Pre-Registration.',
      });
      return;
    }

    const computed = computeServerDeviceFingerprint(req, signals, db.getSessionSecret());

    const result = db.redeemPreRegistrationToRegistration({
      fullName,
      email,
      uniqueCode: registrationCode,
      deviceFingerprint: computed.fingerprint,
      deviceShortId: computed.shortId,
      devicePlatform: computed.platform,
      deviceBrowser: computed.browser,
      ipAddress: getClientIp(req),
    });

    if (!result.ok) {
      res.status(result.statusCode).json({
        error: result.error,
        code: result.code,
      });
      return;
    }

    await db.flushToRemote();
    const token = issueUserSession(req, res, result.record.id, result.record.deviceFingerprint);

    res.status(201).json({
      success: true,
      message: 'Registration completed and verified for your device.',
      registration: db.toPublicRegistration(result.record),
      token,
    });
  });

  app.post('/api/auth/recover', authStrictLimiter, async (req: Request, res: Response) => {
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

    await db.flushToRemote();
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
    async (req: AuthenticatedRequest, res: Response) => {
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
      await db.flushToRemote();

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
  // SOCIAL PLATFORM ROUTES (PROFILES, FEED, LIKES/COMMENTS, STORIES, DIRECT MESSAGES)
  // ============================================================================

  // Serve uploaded photos & videos with HTTP 206 Range streaming for smooth video playback
  app.get('/api/social/media/:fileId', (req: Request, res: Response) => {
    const resolved = resolveUploadedMediaPath(req.params.fileId);
    if (!resolved) {
      res.status(404).json({ error: 'Media asset not found.' });
      return;
    }

    const stat = fs.statSync(resolved.filePath);
    const totalSize = stat.size;
    const rangeHeader = req.headers.range;

    res.setHeader('Content-Type', resolved.contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (!match) {
        res.status(416).setHeader('Content-Range', `bytes */${totalSize}`).end();
        return;
      }
      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
        res.status(416).setHeader('Content-Range', `bytes */${totalSize}`).end();
        return;
      }
      const clampedEnd = Math.min(end, totalSize - 1);
      const chunkSize = clampedEnd - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${clampedEnd}/${totalSize}`);
      res.setHeader('Content-Length', String(chunkSize));
      fs.createReadStream(resolved.filePath, { start, end: clampedEnd }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(totalSize));
    fs.createReadStream(resolved.filePath).pipe(res);
  });

  app.post('/api/social/media', requireRegisteredUser, (req: AuthenticatedRequest, res: Response) => {
    const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
    if (!dataUrl) {
      res.status(400).json({ error: 'Missing media payload.' });
      return;
    }
    const saved = saveUploadedMedia({ dataUrl });
    if (!saved.ok) {
      res.status(saved.statusCode).json({ error: saved.error });
      return;
    }
    res.status(201).json({
      mediaUrl: saved.mediaUrl,
      mediaType: saved.mediaType,
      bytes: saved.bytes,
    });
  });

  app.get('/api/social/profiles', requireRegisteredUser, (req: AuthenticatedRequest, res: Response) => {
    const viewerId = req.registrationId!;
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const onlineSet = new Set(socialHub.getOnlineUserIds());
    const profiles = db.listSocialProfiles(viewerId, q, onlineSet);
    const me = db.getSocialProfile(viewerId, viewerId, onlineSet);
    res.json({ profiles, me });
  });

  app.get(
    '/api/social/profiles/:userId',
    requireRegisteredUser,
    (req: AuthenticatedRequest, res: Response) => {
      const viewerId = req.registrationId!;
      const targetId = req.params.userId === 'me' ? viewerId : req.params.userId;
      const onlineSet = new Set(socialHub.getOnlineUserIds());
      const profile = db.getSocialProfile(targetId, viewerId, onlineSet);
      if (!profile) {
        res.status(404).json({ error: 'Profile not found.' });
        return;
      }
      const posts = db.listFeedPosts(viewerId, { authorId: targetId });
      res.json({ profile, posts });
    }
  );

  app.patch(
    '/api/social/profile',
    requireRegisteredUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.registrationId!;
      const onlineSet = new Set(socialHub.getOnlineUserIds());
      const result = db.updateSocialProfile(
        userId,
        {
          displayName: typeof req.body?.displayName === 'string' ? req.body.displayName : undefined,
          username: typeof req.body?.username === 'string' ? req.body.username : undefined,
          bio: typeof req.body?.bio === 'string' ? req.body.bio : undefined,
          location: typeof req.body?.location === 'string' ? req.body.location : undefined,
          website: typeof req.body?.website === 'string' ? req.body.website : undefined,
          avatarUrl: typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl : undefined,
        },
        onlineSet
      );
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      await db.flushToRemote();
      socialHub.broadcastToAll({ type: 'profile:updated', userId });
      res.json({ profile: result.profile });
    }
  );

  app.post(
    '/api/social/profiles/:userId/follow',
    requireRegisteredUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const followerId = req.registrationId!;
      const targetUserId = req.params.userId;
      const result = db.toggleFollow(followerId, targetUserId);
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      await db.flushToRemote();
      socialHub.broadcastToAll({
        type: 'profile:followed',
        targetUserId,
        followerId,
        following: result.following,
        followersCount: result.followersCount,
      });
      res.json(result);
    }
  );

  app.get('/api/social/feed', requireRegisteredUser, (req: AuthenticatedRequest, res: Response) => {
    const viewerId = req.registrationId!;
    const rawFilter = typeof req.query.filter === 'string' ? req.query.filter : 'all';
    const filter =
      rawFilter === 'following' || rawFilter === 'image' || rawFilter === 'video'
        ? rawFilter
        : 'all';
    const authorId = typeof req.query.authorId === 'string' ? req.query.authorId : undefined;
    const posts = db.listFeedPosts(viewerId, { filter, authorId });
    res.json({ posts });
  });

  app.get(
    '/api/social/posts/:id',
    requireRegisteredUser,
    (req: AuthenticatedRequest, res: Response) => {
      const post = db.getFeedPostById(req.params.id, req.registrationId!);
      if (!post) {
        res.status(404).json({ error: 'Post not found.' });
        return;
      }
      res.json({ post });
    }
  );

  app.post(
    '/api/social/posts',
    requireRegisteredUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const authorId = req.registrationId!;
      const mediaType = req.body?.mediaType as PostMediaType;
      const mediaUrl = typeof req.body?.mediaUrl === 'string' ? req.body.mediaUrl : '';
      const posterUrl = typeof req.body?.posterUrl === 'string' ? req.body.posterUrl : undefined;
      const caption = typeof req.body?.caption === 'string' ? req.body.caption : '';
      const location = typeof req.body?.location === 'string' ? req.body.location : '';

      const result = db.createPost(authorId, {
        mediaType,
        mediaUrl,
        posterUrl,
        caption,
        location,
      });
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      await db.flushToRemote();
      socialHub.broadcastToAll({
        type: 'post:created',
        postId: result.post.id,
        authorId,
      });
      res.status(201).json({ post: result.post });
    }
  );

  app.delete(
    '/api/social/posts/:id',
    requireRegisteredUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const result = db.deletePost(req.params.id, req.registrationId!);
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      await db.flushToRemote();
      socialHub.broadcastToAll({ type: 'post:deleted', postId: req.params.id });
      res.json({ success: true });
    }
  );

  app.post(
    '/api/social/posts/:id/like',
    requireRegisteredUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.registrationId!;
      const postId = req.params.id;
      const result = db.togglePostLike(postId, userId);
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      await db.flushToRemote();
      socialHub.broadcastToAll({
        type: 'post:liked',
        postId,
        likesCount: result.likesCount,
        userId,
        liked: result.liked,
      });
      res.json({ liked: result.liked, likesCount: result.likesCount });
    }
  );

  app.post(
    '/api/social/posts/:id/comments',
    requireRegisteredUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const authorId = req.registrationId!;
      const postId = req.params.id;
      const text = typeof req.body?.text === 'string' ? req.body.text : '';
      const result = db.addPostComment(postId, authorId, text);
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      await db.flushToRemote();
      const { canDelete: _ignored, ...broadcastComment } = result.comment;
      socialHub.broadcastToAll({
        type: 'post:commented',
        postId,
        comment: broadcastComment,
        commentsCount: result.commentsCount,
      });
      res.status(201).json({ comment: result.comment, commentsCount: result.commentsCount });
    }
  );

  app.delete(
    '/api/social/posts/:id/comments/:commentId',
    requireRegisteredUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const postId = req.params.id;
      const commentId = req.params.commentId;
      const result = db.deletePostComment(postId, commentId, req.registrationId!);
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      await db.flushToRemote();
      socialHub.broadcastToAll({
        type: 'post:comment_deleted',
        postId,
        commentId,
        commentsCount: result.commentsCount,
      });
      res.json({ success: true, commentsCount: result.commentsCount });
    }
  );

  app.get('/api/social/stories', requireRegisteredUser, (req: AuthenticatedRequest, res: Response) => {
    const groups = db.listActiveStoryGroups(req.registrationId!);
    res.json({ groups });
  });

  app.post(
    '/api/social/stories',
    requireRegisteredUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const authorId = req.registrationId!;
      const mediaType = req.body?.mediaType as PostMediaType;
      const mediaUrl = typeof req.body?.mediaUrl === 'string' ? req.body.mediaUrl : '';
      const caption = typeof req.body?.caption === 'string' ? req.body.caption : '';
      const result = db.createStory(authorId, { mediaType, mediaUrl, caption });
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      await db.flushToRemote();
      socialHub.broadcastToAll({
        type: 'story:created',
        authorId,
        storyId: result.story.id,
      });
      res.status(201).json({ story: result.story });
    }
  );

  app.post(
    '/api/social/stories/:id/view',
    requireRegisteredUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const result = db.markStoryViewed(req.params.id, req.registrationId!);
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      await db.flushToRemote();
      res.json({ viewsCount: result.viewsCount });
    }
  );

  app.delete(
    '/api/social/stories/:id',
    requireRegisteredUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const result = db.deleteStory(req.params.id, req.registrationId!);
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      await db.flushToRemote();
      socialHub.broadcastToAll({ type: 'story:deleted', storyId: req.params.id });
      res.json({ success: true });
    }
  );

  app.get(
    '/api/social/conversations',
    requireRegisteredUser,
    (req: AuthenticatedRequest, res: Response) => {
      const onlineSet = new Set(socialHub.getOnlineUserIds());
      const { conversations, totalUnread } = db.listConversations(req.registrationId!, onlineSet);
      res.json({ conversations, totalUnread });
    }
  );

  app.get(
    '/api/social/conversations/:peerId/messages',
    requireRegisteredUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.registrationId!;
      const peerId = req.params.peerId;
      const onlineSet = new Set(socialHub.getOnlineUserIds());
      const result = db.getConversationMessages(userId, peerId, onlineSet);
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      if (result.markedReadAt) {
        await db.flushToRemote();
        socialHub.sendToUsers([userId, peerId], {
          type: 'dm:read',
          conversationId: result.conversationId,
          readerId: userId,
          readAt: result.markedReadAt,
        });
      }
      res.json({
        conversationId: result.conversationId,
        peer: result.peer,
        messages: result.messages,
      });
    }
  );

  app.post(
    '/api/social/conversations/:peerId/messages',
    requireRegisteredUser,
    async (req: AuthenticatedRequest, res: Response) => {
      const senderId = req.registrationId!;
      const recipientId = req.params.peerId;
      const result = db.sendDirectMessage(senderId, recipientId, {
        text: typeof req.body?.text === 'string' ? req.body.text : '',
        mediaType: req.body?.mediaType as PostMediaType | undefined,
        mediaUrl: typeof req.body?.mediaUrl === 'string' ? req.body.mediaUrl : undefined,
        storyRefId: typeof req.body?.storyRefId === 'string' ? req.body.storyRefId : undefined,
      });
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      await db.flushToRemote();
      socialHub.sendToUsers([senderId, recipientId], {
        type: 'dm:message',
        message: result.message,
      });
      res.status(201).json({ message: result.message });
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

  app.patch('/api/admin/settings', requireAdmin, async (req: Request, res: Response) => {
    if (typeof req.body?.registrationsEnabled !== 'boolean') {
      res.status(400).json({ error: 'registrationsEnabled boolean is required.' });
      return;
    }
    const enabled = db.setRegistrationsEnabled(req.body.registrationsEnabled);
    await db.flushToRemote();
    res.json({ registrationsEnabled: enabled });
  });

  app.get('/api/admin/registrations', requireAdmin, (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const status = typeof req.query.status === 'string' ? req.query.status : 'ALL';
    const registrations = db.listRegistrationsForAdmin({ q, status });
    res.json({ registrations });
  });

  app.patch('/api/admin/registrations/:id/status', requireAdmin, async (req: Request, res: Response) => {
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
    await db.flushToRemote();
    res.json({ registration: db.toPublicRegistration(updated) });
  });

  app.post('/api/admin/registrations/:id/recovery', requireAdmin, async (req: Request, res: Response) => {
    const unbindCurrentDevice = Boolean(req.body?.unbindCurrentDevice);
    const result = db.issueDeviceRecovery(req.params.id, unbindCurrentDevice);
    if (!result) {
      res.status(404).json({ error: 'Registration record not found.' });
      return;
    }
    await db.flushToRemote();
    res.json({
      success: true,
      recoveryKey: result.recoveryKey,
      unbindCurrentDevice,
      registration: db.toPublicRegistration(result.record),
    });
  });

  app.delete('/api/admin/registrations/:id', requireAdmin, async (req: Request, res: Response) => {
    const deleted = db.deleteRegistration(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Registration record not found.' });
      return;
    }
    await db.flushToRemote();
    res.json({ success: true });
  });

  app.get('/api/admin/downloads', requireAdmin, (_req: Request, res: Response) => {
    res.json({ items: db.listDownloads() });
  });

  app.post('/api/admin/downloads', requireAdmin, async (req: Request, res: Response) => {
    const check = validateDownloadPayload(req.body);
    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }
    const created = db.createDownload(check.payload);
    await db.flushToRemote();
    res.status(201).json({ item: created });
  });

  app.put('/api/admin/downloads/:id', requireAdmin, async (req: Request, res: Response) => {
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
    await db.flushToRemote();
    res.json({ item: updated });
  });

  app.delete('/api/admin/downloads/:id', requireAdmin, async (req: Request, res: Response) => {
    const deleted = db.deleteDownload(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Download package not found.' });
      return;
    }
    await db.flushToRemote();
    res.json({ success: true });
  });

  return app;
}

export const apiApp = createApiApp();
