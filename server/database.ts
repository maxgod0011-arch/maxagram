import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AdminOverview,
  AdminRegistrationView,
  ConversationSummary,
  DirectMessage,
  DownloadCategory,
  DownloadFormPayload,
  DownloadItem,
  DownloadLog,
  FeedPost,
  PostComment,
  PostMediaType,
  PublicPreRegistration,
  PublicRegistration,
  RegistrationStatus,
  SocialProfile,
  StoryGroup,
  StoryItem,
} from '../shared/types.ts';
import {
  OFFICIAL_REGISTRATION_CODE,
  generateRecoveryKey,
  generateSha256FromText,
  hashPassword,
  hashSecretValue,
  timingSafeEqualHex,
  verifyPassword,
} from './security.ts';
import {
  buildConversationId,
  createSeedSocialData,
} from './socialSeed.ts';
import type {
  StoredComment,
  StoredDirectMessage,
  StoredFollow,
  StoredPost,
  StoredSocialProfile,
  StoredStory,
} from './socialSeed.ts';

interface StoredRegistration {
  id: string;
  fullName: string;
  email: string;
  emailNormalized: string;
  status: RegistrationStatus;
  codeUsed: string;
  deviceFingerprint: string;
  deviceShortId: string;
  devicePlatform: string;
  deviceBrowser: string;
  ipAddress: string;
  registeredAt: string;
  lastVerifiedAt: string;
  recoveryCodeHash: string | null;
  recoveryIssuedAt: string | null;
  deviceResetRequired: boolean;
}

interface StoredPreRegistration {
  id: string;
  fullName: string;
  email: string;
  emailNormalized: string;
  uniqueCode: string;
  deviceFingerprint: string;
  deviceShortId: string;
  devicePlatform: string;
  deviceBrowser: string;
  ipAddress: string;
  createdAt: string;
  redeemedAt: string | null;
}

interface StoredAdmin {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

interface DatabaseSchema {
  version: number;
  sessionSecret: string;
  settings: {
    registrationsEnabled: boolean;
  };
  admins: StoredAdmin[];
  preRegistrations: StoredPreRegistration[];
  registrations: StoredRegistration[];
  downloads: DownloadItem[];
  downloadLogs: DownloadLog[];
  profiles: StoredSocialProfile[];
  follows: StoredFollow[];
  posts: StoredPost[];
  stories: StoredStory[];
  messages: StoredDirectMessage[];
}

export interface RemoteStoreAdapter {
  read: () => Promise<string | null>;
  write: (serialized: string) => Promise<void>;
}

const IS_SERVERLESS = Boolean(
  process.env.VERCEL === '1' ||
    process.env.VERCEL_ENV ||
    process.env.NETLIFY === 'true' ||
    process.env.NETLIFY_LOCAL === 'true' ||
    process.env.SITE_ID ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
);

const DATA_DIR = process.env.MAXAGRAM_DATA_DIR
  ? path.resolve(process.env.MAXAGRAM_DATA_DIR)
  : IS_SERVERLESS
    ? path.join(os.tmpdir(), 'maxagram-data')
    : path.resolve(process.cwd(), 'data');

const DB_FILE = path.join(DATA_DIR, 'maxagram-store.json');
const REMOTE_KV_KEY = 'maxagram:db:v1';

const COVER_CREATIVE = '/src/assets/images/cover_creative_suite_1795098371414.jpg';
const COVER_SECURITY = '/src/assets/images/cover_security_vault_1795098371647.jpg';
const COVER_AUDIO = '/src/assets/images/cover_audio_studio_1795098371788.jpg';
const COVER_DEV = '/src/assets/images/cover_dev_tools_1795098371181.jpg';

function getRemoteKvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return { url: url.replace(/\/+$/, ''), token };
  }
  return null;
}

function createSeedDownloads(): DownloadItem[] {
  const items: Array<Omit<DownloadItem, 'sha256'>> = [
    {
      id: 'dl-kinetix-studio',
      slug: 'kinetix-studio',
      title: 'Kinetix Studio',
      category: 'Creative Suites',
      version: '3.4.0',
      fileSize: '284 MB',
      fileName: 'Maxagram_KinetixStudio_3.4.0.zip',
      shortDescription:
        'Non-linear motion compositor and HDR color grading workbench engineered for 4K timelines.',
      description:
        'Kinetix Studio combines real-time GPU node compositing, 16-bit color wheels, and frame-accurate keyframe curves in a unified desktop environment. Built for post-production studios that demand deterministic exports without cloud subscription lock-in.',
      releaseNotes:
        'Added Metal and Vulkan hardware acceleration for 10-bit ProRes timelines, redesigned LUT preview scopes, and reduced cold launch memory usage by 28%.',
      requirements: 'Windows 11 / macOS 14+ / Linux x64 · 16 GB RAM · Vulkan 1.3 GPU',
      coverImage: COVER_CREATIVE,
      featured: true,
      downloadsCount: 1842,
      releasedAt: '2026-11-12T09:00:00.000Z',
      updatedAt: '2026-11-12T09:00:00.000Z',
    },
    {
      id: 'dl-vaultguard-desktop',
      slug: 'vaultguard-desktop',
      title: 'VaultGuard Desktop & CLI',
      category: 'Security & Privacy',
      version: '2.1.4',
      fileSize: '64.2 MB',
      fileName: 'Maxagram_VaultGuard_2.1.4.zip',
      shortDescription:
        'Zero-knowledge offline credential vault with hardware FIDO2 key authentication and audit trails.',
      description:
        'VaultGuard secures SSH keys, API secrets, and team credentials inside locally encrypted Argon2id + AES-256-GCM vaults. Includes a native desktop interface and scriptable CLI for developer environments.',
      releaseNotes:
        'Added YubiKey Bio attestation, automatic clipboard scrubbing after 20 seconds, and deterministic offline vault backup verification.',
      requirements: 'Windows 10+ / macOS 13+ / Linux x64 · 4 GB RAM · 250 MB Disk',
      coverImage: COVER_SECURITY,
      featured: true,
      downloadsCount: 2490,
      releasedAt: '2026-11-10T14:30:00.000Z',
      updatedAt: '2026-11-10T14:30:00.000Z',
    },
    {
      id: 'dl-pulseaudio-rack',
      slug: 'pulseaudio-rack',
      title: 'PulseAudio Mastering Rack',
      category: 'Media & Audio',
      version: '4.0.2',
      fileSize: '192 MB',
      fileName: 'Maxagram_PulseAudioRack_4.0.2.zip',
      shortDescription:
        'Low-latency multi-track mastering console with linear-phase EQ and loudness metering.',
      description:
        'PulseAudio Mastering Rack provides studio-grade dynamics processing, true-peak ITU-R BS.1770 loudness metering, and real-time phase correlation tools with sub-2ms audio engine latency.',
      releaseNotes:
        'Introduced 64-bit internal summing engine, updated analog tape saturation module, and added Apple Silicon native AUv3 plugin hosting.',
      requirements: 'Windows 11 / macOS 13+ · ASIO or CoreAudio Interface · 8 GB RAM',
      coverImage: COVER_AUDIO,
      featured: true,
      downloadsCount: 1510,
      releasedAt: '2026-11-08T11:15:00.000Z',
      updatedAt: '2026-11-08T11:15:00.000Z',
    },
    {
      id: 'dl-forgedb-workbench',
      slug: 'forgedb-workbench',
      title: 'ForgeDB Workbench',
      category: 'Developer Tools',
      version: '1.9.5',
      fileSize: '118 MB',
      fileName: 'Maxagram_ForgeDB_1.9.5.zip',
      shortDescription:
        'Visual relational schema explorer, execution plan profiler, and safe migration diff utility.',
      description:
        'Connect securely over SSH tunnels to inspect table structures, visualize query execution trees, compare environments side-by-side, and export typed schemas in seconds.',
      releaseNotes:
        'Added instant JSONB column tree view, keyboard-driven SQL command palette, and safer read-only production safeguards.',
      requirements: 'Windows 10+ / macOS 13+ / Linux AppImage · 8 GB RAM',
      coverImage: COVER_DEV,
      featured: false,
      downloadsCount: 3120,
      releasedAt: '2026-11-15T16:20:00.000Z',
      updatedAt: '2026-11-15T16:20:00.000Z',
    },
    {
      id: 'dl-chronos-backup',
      slug: 'chronos-backup',
      title: 'Chronos Backup Engine',
      category: 'System Utilities',
      version: '2.6.0',
      fileSize: '86.5 MB',
      fileName: 'Maxagram_ChronosBackup_2.6.0.zip',
      shortDescription:
        'Deduplicated incremental disk snapshots with end-to-end encryption for local and NAS drives.',
      description:
        'Chronos monitors block-level file modifications to create verifiable point-in-time snapshots without slowing workstation throughput. Supports automated integrity checks and bare-metal restore manifests.',
      releaseNotes:
        'Improved Zstandard compression ratio by 14%, added scheduled wake-on-LAN NAS sync, and improved restore verification reporting.',
      requirements: 'Windows 10+ / macOS 13+ / Linux x64 · 4 GB RAM',
      coverImage: COVER_DEV,
      featured: false,
      downloadsCount: 2215,
      releasedAt: '2026-11-16T08:45:00.000Z',
      updatedAt: '2026-11-16T08:45:00.000Z',
    },
    {
      id: 'dl-vectorcraft-pro',
      slug: 'vectorcraft-pro',
      title: 'VectorCraft Studio',
      category: 'Creative Suites',
      version: '3.1.2',
      fileSize: '215 MB',
      fileName: 'Maxagram_VectorCraft_3.1.2.zip',
      shortDescription:
        'Precision bezier illustration studio, variable font authoring, and lossless SVG path optimizer.',
      description:
        'Designed for iconographers, brand designers, and UI systems teams. VectorCraft renders infinite-zoom boolean geometry at 120fps and outputs production-ready SVG and PDF assets.',
      releaseNotes:
        'New symmetry grid guides, automated optical kerning preview, and batch SVG minification presets.',
      requirements: 'Windows 11 / macOS 13+ · 8 GB RAM · OpenGL 4.5 or Metal',
      coverImage: COVER_CREATIVE,
      featured: false,
      downloadsCount: 1185,
      releasedAt: '2026-11-17T10:00:00.000Z',
      updatedAt: '2026-11-17T10:00:00.000Z',
    },
    {
      id: 'dl-netscope-monitor',
      slug: 'netscope-monitor',
      title: 'NetScope Profiler',
      category: 'System Utilities',
      version: '1.5.8',
      fileSize: '52.4 MB',
      fileName: 'Maxagram_NetScope_1.5.8.zip',
      shortDescription:
        'Local network interface analyzer, TLS handshake inspector, and per-process bandwidth monitor.',
      description:
        'Gain immediate visibility into outbound workstation connections, DNS resolution timings, and socket throughput without external telemetry agents.',
      releaseNotes:
        'Added QUIC/HTTP3 stream decoding, CSV capture exports, and reduced background CPU overhead below 1%.',
      requirements: 'Windows 10+ / macOS 13+ / Linux x64 · Admin privileges for packet capture',
      coverImage: COVER_SECURITY,
      featured: false,
      downloadsCount: 940,
      releasedAt: '2026-11-18T12:10:00.000Z',
      updatedAt: '2026-11-18T12:10:00.000Z',
    },
    {
      id: 'dl-codex-diff',
      slug: 'codex-diff',
      title: 'Codex Merge & Diff',
      category: 'Developer Tools',
      version: '2.3.1',
      fileSize: '74.8 MB',
      fileName: 'Maxagram_CodexDiff_2.3.1.zip',
      shortDescription:
        'Syntax-aware three-way code merge tool and high-speed directory archive comparator.',
      description:
        'Resolve complex repository conflicts with AST-aware structural diffing across 45+ programming languages, binary hex comparison, and seamless Git mergetool integration.',
      releaseNotes:
        'Added TypeScript 5.8 and Rust 2024 AST parsers, side-by-side inline character highlights, and instant directory checksum mode.',
      requirements: 'Windows 10+ / macOS 13+ / Linux x64 · 4 GB RAM',
      coverImage: COVER_DEV,
      featured: false,
      downloadsCount: 2780,
      releasedAt: '2026-11-05T15:00:00.000Z',
      updatedAt: '2026-11-05T15:00:00.000Z',
    },
    {
      id: 'dl-cipherdrive-mount',
      slug: 'cipherdrive-mount',
      title: 'CipherDrive Mount',
      category: 'Security & Privacy',
      version: '1.7.0',
      fileSize: '48.9 MB',
      fileName: 'Maxagram_CipherDrive_1.7.0.zip',
      shortDescription:
        'Hardware-accelerated virtual encrypted disk volumes with automatic idle unmount protection.',
      description:
        'Create portable encrypted containers that mount as native drives across desktop operating systems. Protects confidential archives with AES-256-XTS and plausible deniability headers.',
      releaseNotes:
        'Added macFUSE 4.8 support, touch/biometric quick unlock, and multi-core read-ahead caching.',
      requirements: 'Windows 10+ / macOS 13+ / Linux FUSE3 · 4 GB RAM',
      coverImage: COVER_SECURITY,
      featured: false,
      downloadsCount: 1340,
      releasedAt: '2026-11-14T18:00:00.000Z',
      updatedAt: '2026-11-14T18:00:00.000Z',
    },
    {
      id: 'dl-horizon-workspace',
      slug: 'horizon-workspace',
      title: 'Horizon Notes & Docs',
      category: 'Desktop Apps',
      version: '2.8.0',
      fileSize: '96.0 MB',
      fileName: 'Maxagram_HorizonDocs_2.8.0.zip',
      shortDescription:
        'Local-first Markdown technical documentation suite with bidirectional links and PDF publishing.',
      description:
        'Write technical specifications, engineering handbooks, and research notes in plain Markdown stored strictly on your filesystem, with instant full-text search and clean print-ready PDF export.',
      releaseNotes:
        'Added LaTeX math block preview, custom CSS export themes, and sub-10ms indexing across 50,000 documents.',
      requirements: 'Windows 10+ / macOS 13+ / Linux x64 · 4 GB RAM',
      coverImage: COVER_AUDIO,
      featured: false,
      downloadsCount: 1625,
      releasedAt: '2026-11-18T19:30:00.000Z',
      updatedAt: '2026-11-18T19:30:00.000Z',
    },
  ];

  return items.map((item) => ({
    ...item,
    sha256: generateSha256FromText(`${item.id}:${item.version}:${item.fileName}`),
  }));
}

function resolveDefaultSessionSecret(): string {
  if (process.env.MAXAGRAM_SESSION_SECRET && process.env.MAXAGRAM_SESSION_SECRET.length >= 16) {
    return process.env.MAXAGRAM_SESSION_SECRET;
  }
  if (IS_SERVERLESS) {
    // Stable fallback across serverless instances until MAXAGRAM_SESSION_SECRET is configured
    const seed =
      process.env.VERCEL_PROJECT_ID ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.SITE_ID ||
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      'maxagram-serverless-production-fallback';
    return crypto.createHash('sha256').update(`maxagram-secret:${seed}`).digest('hex');
  }
  return crypto.randomBytes(32).toString('hex');
}

function createInitialDatabase(): DatabaseSchema {
  const sessionSecret = resolveDefaultSessionSecret();
  const adminEmail = (process.env.MAXAGRAM_ADMIN_EMAIL || 'admin@maxagram.io').trim().toLowerCase();
  const adminPassword = process.env.MAXAGRAM_ADMIN_PASSWORD || 'MaxagramAdmin#2026';

  const seededRegistrations: StoredRegistration[] = [
    {
      id: 'reg-seed-101',
      fullName: 'Elena Vance',
      email: 'elena.vance@studio-nord.io',
      emailNormalized: 'elena.vance@studio-nord.io',
      status: 'ACTIVE',
      codeUsed: 'MXG-7A4C-19E2',
      deviceFingerprint: generateSha256FromText('seed-device-elena-macbook-pro'),
      deviceShortId: 'DEV-7A4C-19E2',
      devicePlatform: 'macOS',
      deviceBrowser: 'Apple Safari',
      ipAddress: '198.51.100.42',
      registeredAt: '2026-11-14T10:22:00.000Z',
      lastVerifiedAt: '2026-11-18T16:45:00.000Z',
      recoveryCodeHash: null,
      recoveryIssuedAt: null,
      deviceResetRequired: false,
    },
    {
      id: 'reg-seed-102',
      fullName: 'Marcus Chen',
      email: 'm.chen@aperturelabs.dev',
      emailNormalized: 'm.chen@aperturelabs.dev',
      status: 'ACTIVE',
      codeUsed: 'MXG-3F91-8B04',
      deviceFingerprint: generateSha256FromText('seed-device-marcus-workstation'),
      deviceShortId: 'DEV-3F91-8B04',
      devicePlatform: 'Windows',
      deviceBrowser: 'Google Chrome',
      ipAddress: '203.0.113.88',
      registeredAt: '2026-11-16T08:15:00.000Z',
      lastVerifiedAt: '2026-11-19T05:10:00.000Z',
      recoveryCodeHash: null,
      recoveryIssuedAt: null,
      deviceResetRequired: false,
    },
    {
      id: 'reg-seed-103',
      fullName: 'Sora Takahashi',
      email: 'sora@kurokawa-audio.jp',
      emailNormalized: 'sora@kurokawa-audio.jp',
      status: 'DISABLED',
      codeUsed: 'MXG-C205-4E7A',
      deviceFingerprint: generateSha256FromText('seed-device-sora-linux-rig'),
      deviceShortId: 'DEV-C205-4E7A',
      devicePlatform: 'Linux',
      deviceBrowser: 'Mozilla Firefox',
      ipAddress: '192.0.2.19',
      registeredAt: '2026-11-11T21:40:00.000Z',
      lastVerifiedAt: '2026-11-15T12:05:00.000Z',
      recoveryCodeHash: null,
      recoveryIssuedAt: null,
      deviceResetRequired: false,
    },
  ];

  const seededLogs: DownloadLog[] = [
    {
      id: 'log-seed-1',
      fileId: 'dl-kinetix-studio',
      fileTitle: 'Kinetix Studio',
      fileVersion: '3.4.0',
      registrationId: 'reg-seed-101',
      userEmail: 'elena.vance@studio-nord.io',
      deviceShortId: 'DEV-7A4C-19E2',
      downloadedAt: '2026-11-18T16:45:00.000Z',
    },
    {
      id: 'log-seed-2',
      fileId: 'dl-vaultguard-desktop',
      fileTitle: 'VaultGuard Desktop & CLI',
      fileVersion: '2.1.4',
      registrationId: 'reg-seed-102',
      userEmail: 'm.chen@aperturelabs.dev',
      deviceShortId: 'DEV-3F91-8B04',
      downloadedAt: '2026-11-19T05:10:00.000Z',
    },
    {
      id: 'log-seed-3',
      fileId: 'dl-forgedb-workbench',
      fileTitle: 'ForgeDB Workbench',
      fileVersion: '1.9.5',
      registrationId: 'reg-seed-102',
      userEmail: 'm.chen@aperturelabs.dev',
      deviceShortId: 'DEV-3F91-8B04',
      downloadedAt: '2026-11-18T19:22:00.000Z',
    },
  ];

  const socialSeed = createSeedSocialData();

  return {
    version: 3,
    sessionSecret,
    settings: {
      registrationsEnabled: true,
    },
    admins: [
      {
        id: 'admin-root-1',
        email: adminEmail,
        name: 'MAXAGRAM Administrator',
        passwordHash: hashPassword(adminPassword),
        createdAt: new Date().toISOString(),
      },
    ],
    preRegistrations: [],
    registrations: seededRegistrations,
    downloads: createSeedDownloads(),
    downloadLogs: seededLogs,
    profiles: socialSeed.profiles,
    follows: socialSeed.follows,
    posts: socialSeed.posts,
    stories: socialSeed.stories,
    messages: socialSeed.messages,
  };
}

class MaxagramDatabase {
  private data: DatabaseSchema;
  private dirty = false;
  private remoteAdapter: RemoteStoreAdapter | null = null;

  constructor() {
    this.data = this.loadFromDisk();
  }

  public setRemoteAdapter(adapter: RemoteStoreAdapter | null): void {
    this.remoteAdapter = adapter;
  }

  private normalizeSnapshot(parsed: DatabaseSchema): DatabaseSchema {
    if (!Array.isArray(parsed.preRegistrations)) {
      parsed.preRegistrations = [];
    }

    const socialSeed = createSeedSocialData();
    if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
      parsed.profiles = socialSeed.profiles;
    }
    if (!Array.isArray(parsed.follows)) {
      parsed.follows = socialSeed.follows;
    }
    if (!Array.isArray(parsed.posts)) {
      parsed.posts = socialSeed.posts;
    }
    if (!Array.isArray(parsed.stories)) {
      parsed.stories = socialSeed.stories;
    } else {
      const nowMs = Date.now();
      const hasAnyActive = parsed.stories.some((s) => new Date(s.expiresAt).getTime() > nowMs);
      const onlySeedStories =
        parsed.stories.length > 0 && parsed.stories.every((s) => s.id.startsWith('story-seed-'));
      if (!hasAnyActive && onlySeedStories) {
        parsed.stories = socialSeed.stories;
      }
    }
    if (!Array.isArray(parsed.messages)) {
      parsed.messages = socialSeed.messages;
    }

    // Backfill social profiles for any registered users who signed up before social features existed
    for (const reg of parsed.registrations) {
      if (!parsed.profiles.some((p) => p.userId === reg.id)) {
        const baseHandle = this.sanitizeUsername(
          reg.fullName || reg.email.split('@')[0] || 'member'
        );
        const existingHandles = new Set(parsed.profiles.map((p) => p.username));
        let candidate = baseHandle;
        let suffix = 1;
        while (existingHandles.has(candidate)) {
          candidate = `${baseHandle.slice(0, 19)}${suffix}`;
          suffix += 1;
        }
        parsed.profiles.push({
          userId: reg.id,
          username: candidate,
          displayName: reg.fullName,
          bio: '',
          location: '',
          website: '',
          avatarUrl: '',
          joinedAt: reg.registeredAt,
        });
      }
    }

    parsed.version = 3;
    return parsed;
  }

  private loadFromDisk(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw) as DatabaseSchema;
        if (parsed && Array.isArray(parsed.downloads) && Array.isArray(parsed.registrations)) {
          return this.normalizeSnapshot(parsed);
        }
      }
    } catch (err) {
      console.error('Failed to read existing database snapshot, initializing clean store:', err);
    }

    const fresh = createInitialDatabase();
    this.persist(fresh);
    return fresh;
  }

  private persist(target: DatabaseSchema = this.data): void {
    this.dirty = true;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpPath = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(target, null, 2), 'utf8');
      fs.renameSync(tmpPath, DB_FILE);
    } catch (err) {
      console.error('Disk persistence warning (in-memory/remote store remains active):', err);
    }
  }

  /**
   * Synchronizes state from Upstash Redis / Vercel KV REST or a registered
   * serverless adapter (such as Netlify Blobs), enabling shared persistence
   * across serverless invocations.
   */
  public async syncFromRemote(): Promise<void> {
    const kv = getRemoteKvConfig();
    if (kv) {
      try {
        const response = await fetch(`${kv.url}/get/${encodeURIComponent(REMOTE_KV_KEY)}`, {
          headers: { Authorization: `Bearer ${kv.token}` },
        });
        if (!response.ok) return;
        const body = (await response.json()) as { result?: string | null };
        if (typeof body?.result === 'string' && body.result.length > 0) {
          const parsed = JSON.parse(body.result) as DatabaseSchema;
          if (parsed && Array.isArray(parsed.downloads) && Array.isArray(parsed.registrations)) {
            this.data = this.normalizeSnapshot(parsed);
            this.dirty = false;
          }
        } else {
          await this.flushToRemote(true);
        }
      } catch (err) {
        console.error('Remote KV sync skipped:', err);
      }
      return;
    }

    if (this.remoteAdapter) {
      try {
        const raw = await this.remoteAdapter.read();
        if (typeof raw === 'string' && raw.length > 0) {
          const parsed = JSON.parse(raw) as DatabaseSchema;
          if (parsed && Array.isArray(parsed.downloads) && Array.isArray(parsed.registrations)) {
            this.data = this.normalizeSnapshot(parsed);
            this.dirty = false;
          }
        } else {
          await this.flushToRemote(true);
        }
      } catch (err) {
        console.error('Remote store adapter sync skipped:', err);
      }
    }
  }

  public async flushToRemote(force = false): Promise<void> {
    if (!force && !this.dirty) return;

    const kv = getRemoteKvConfig();
    if (kv) {
      try {
        await fetch(`${kv.url}/set/${encodeURIComponent(REMOTE_KV_KEY)}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${kv.token}`,
            'Content-Type': 'text/plain; charset=utf-8',
          },
          body: JSON.stringify(this.data),
        });
        this.dirty = false;
      } catch (err) {
        console.error('Remote KV flush failed:', err);
      }
      return;
    }

    if (this.remoteAdapter) {
      try {
        await this.remoteAdapter.write(JSON.stringify(this.data));
        this.dirty = false;
      } catch (err) {
        console.error('Remote store adapter flush failed:', err);
      }
      return;
    }

    this.dirty = false;
  }

  public getSessionSecret(): string {
    return process.env.MAXAGRAM_SESSION_SECRET && process.env.MAXAGRAM_SESSION_SECRET.length >= 16
      ? process.env.MAXAGRAM_SESSION_SECRET
      : this.data.sessionSecret;
  }

  public isRegistrationsEnabled(): boolean {
    return this.data.settings.registrationsEnabled;
  }

  public setRegistrationsEnabled(enabled: boolean): boolean {
    this.data.settings.registrationsEnabled = enabled;
    this.persist();
    return enabled;
  }

  public toPublicRegistration(reg: StoredRegistration): PublicRegistration {
    return {
      id: reg.id,
      fullName: reg.fullName,
      email: reg.email,
      status: reg.status,
      codeUsed: reg.codeUsed,
      deviceShortId: reg.deviceShortId,
      devicePlatform: reg.devicePlatform,
      deviceBrowser: reg.deviceBrowser,
      registeredAt: reg.registeredAt,
      lastVerifiedAt: reg.lastVerifiedAt,
      recoveryPending: Boolean(reg.recoveryCodeHash),
    };
  }

  public toPublicPreRegistration(pre: StoredPreRegistration): PublicPreRegistration {
    return {
      id: pre.id,
      fullName: pre.fullName,
      email: pre.email,
      deviceShortId: pre.deviceShortId,
      devicePlatform: pre.devicePlatform,
      deviceBrowser: pre.deviceBrowser,
      createdAt: pre.createdAt,
      redeemed: Boolean(pre.redeemedAt),
    };
  }

  public findPreRegistrationByDeviceFingerprint(
    fingerprint: string
  ): StoredPreRegistration | undefined {
    return this.data.preRegistrations.find((p) => p.deviceFingerprint === fingerprint);
  }

  public findPreRegistrationByEmail(email: string): StoredPreRegistration | undefined {
    const normalized = email.trim().toLowerCase();
    return this.data.preRegistrations.find((p) => p.emailNormalized === normalized);
  }

  public findPreRegistrationByCode(code: string): StoredPreRegistration | undefined {
    const normalized = code.trim().toUpperCase();
    return this.data.preRegistrations.find((p) => p.uniqueCode === normalized);
  }

  public createPreRegistration(input: {
    fullName?: string;
    email?: string;
    deviceFingerprint: string;
    deviceShortId: string;
    devicePlatform: string;
    deviceBrowser: string;
    ipAddress: string;
  }): StoredPreRegistration {
    const now = new Date().toISOString();
    const cleanName = (input.fullName || '').trim();
    const cleanEmail = (input.email || '').trim();
    const record: StoredPreRegistration = {
      id: `pre-${crypto.randomUUID()}`,
      fullName: cleanName,
      email: cleanEmail,
      emailNormalized: cleanEmail.toLowerCase(),
      uniqueCode: OFFICIAL_REGISTRATION_CODE,
      deviceFingerprint: input.deviceFingerprint,
      deviceShortId: input.deviceShortId,
      devicePlatform: input.devicePlatform,
      deviceBrowser: input.deviceBrowser,
      ipAddress: input.ipAddress,
      createdAt: now,
      redeemedAt: null,
    };
    this.data.preRegistrations.unshift(record);
    if (this.data.preRegistrations.length > 2000) {
      this.data.preRegistrations = this.data.preRegistrations.slice(0, 2000);
    }
    this.persist();
    return record;
  }

  private deriveNameFromEmail(email: string): string {
    const local = email.split('@')[0] || 'MAXAGRAM Member';
    const words = local
      .replace(/[._-]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    return words.length > 0 ? words.join(' ') : 'MAXAGRAM Member';
  }

  public redeemPreRegistrationToRegistration(input: {
    fullName?: string;
    email: string;
    uniqueCode: string;
    deviceFingerprint: string;
    deviceShortId: string;
    devicePlatform: string;
    deviceBrowser: string;
    ipAddress: string;
  }):
    | { ok: true; record: StoredRegistration }
    | { ok: false; statusCode: number; error: string; code?: string } {
    const submittedCode = input.uniqueCode.trim();
    const normalizedEmail = input.email.trim().toLowerCase();

    if (submittedCode !== OFFICIAL_REGISTRATION_CODE) {
      return {
        ok: false,
        statusCode: 400,
        error:
          'Invalid registration code. Only the official code issued via Pre-Registration is accepted.',
        code: 'INVALID_CODE',
      };
    }

    const preReg = this.data.preRegistrations.find(
      (p) => p.deviceFingerprint === input.deviceFingerprint && !p.redeemedAt
    );

    const now = new Date().toISOString();
    const resolvedName =
      (input.fullName || '').trim() ||
      preReg?.fullName ||
      this.deriveNameFromEmail(input.email.trim());

    const existingEmail = this.findRegistrationByEmail(normalizedEmail);
    if (existingEmail) {
      if (existingEmail.status !== 'ACTIVE') {
        return {
          ok: false,
          statusCode: 403,
          error: 'This account registration is currently disabled by an administrator.',
          code: 'REGISTRATION_DISABLED',
        };
      }
      if (preReg) {
        preReg.redeemedAt = now;
        if (!preReg.emailNormalized) {
          preReg.email = existingEmail.email;
          preReg.emailNormalized = existingEmail.emailNormalized;
          preReg.fullName = existingEmail.fullName;
        }
      }
      existingEmail.codeUsed = OFFICIAL_REGISTRATION_CODE;
      existingEmail.deviceFingerprint = input.deviceFingerprint;
      existingEmail.deviceShortId = input.deviceShortId;
      existingEmail.devicePlatform = input.devicePlatform;
      existingEmail.deviceBrowser = input.deviceBrowser;
      existingEmail.ipAddress = input.ipAddress;
      existingEmail.lastVerifiedAt = now;
      existingEmail.deviceResetRequired = false;
      this.ensureProfileForRegistration(existingEmail, false);
      this.persist();
      return { ok: true, record: existingEmail };
    }

    if (preReg) {
      preReg.redeemedAt = now;
      if (!preReg.emailNormalized) {
        preReg.email = input.email.trim();
        preReg.emailNormalized = normalizedEmail;
        preReg.fullName = resolvedName;
      }
    }

    const record: StoredRegistration = {
      id: `reg-${crypto.randomUUID()}`,
      fullName: resolvedName,
      email: input.email.trim(),
      emailNormalized: normalizedEmail,
      status: 'ACTIVE',
      codeUsed: OFFICIAL_REGISTRATION_CODE,
      deviceFingerprint: input.deviceFingerprint,
      deviceShortId: input.deviceShortId,
      devicePlatform: input.devicePlatform,
      deviceBrowser: input.deviceBrowser,
      ipAddress: input.ipAddress,
      registeredAt: now,
      lastVerifiedAt: now,
      recoveryCodeHash: null,
      recoveryIssuedAt: null,
      deviceResetRequired: false,
    };
    this.data.registrations.unshift(record);
    this.ensureProfileForRegistration(record, false);
    this.persist();
    return { ok: true, record };
  }

  public findRegistrationById(id: string): StoredRegistration | undefined {
    return this.data.registrations.find((r) => r.id === id);
  }

  public findRegistrationByDeviceFingerprint(fingerprint: string): StoredRegistration | undefined {
    return this.data.registrations.find((r) => r.deviceFingerprint === fingerprint);
  }

  public findRegistrationByEmail(email: string): StoredRegistration | undefined {
    const normalized = email.trim().toLowerCase();
    return this.data.registrations.find((r) => r.emailNormalized === normalized);
  }

  public touchVerification(regId: string, ipAddress?: string): StoredRegistration | undefined {
    const record = this.findRegistrationById(regId);
    if (!record) return undefined;
    record.lastVerifiedAt = new Date().toISOString();
    if (ipAddress) record.ipAddress = ipAddress;
    this.persist();
    return record;
  }

  public updateRegistrationStatus(regId: string, status: RegistrationStatus): StoredRegistration | null {
    const record = this.findRegistrationById(regId);
    if (!record) return null;
    record.status = status;
    this.persist();
    return record;
  }

  public issueDeviceRecovery(
    regId: string,
    unbindCurrentDevice: boolean
  ): { record: StoredRegistration; recoveryKey: string } | null {
    const record = this.findRegistrationById(regId);
    if (!record) return null;

    const recoveryKey = generateRecoveryKey();
    record.recoveryCodeHash = hashSecretValue(recoveryKey, this.getSessionSecret());
    record.recoveryIssuedAt = new Date().toISOString();
    record.deviceResetRequired = unbindCurrentDevice;
    if (unbindCurrentDevice) {
      record.deviceFingerprint = `UNBOUND-${crypto.randomUUID()}`;
      record.deviceShortId = 'UNBOUND';
    }
    this.persist();
    return { record, recoveryKey };
  }

  public completeDeviceRecovery(input: {
    email: string;
    recoveryKey?: string;
    currentDeviceFingerprint: string;
    currentDeviceShortId: string;
    currentPlatform: string;
    currentBrowser: string;
    ipAddress: string;
  }): { ok: true; record: StoredRegistration } | { ok: false; error: string; statusCode: number } {
    const record = this.findRegistrationByEmail(input.email);
    if (!record) {
      return {
        ok: false,
        statusCode: 404,
        error: 'No existing registration was found for that email address.',
      };
    }

    if (record.status !== 'ACTIVE') {
      return {
        ok: false,
        statusCode: 403,
        error: 'This account registration is currently disabled by an administrator.',
      };
    }

    const trimmedKey = (input.recoveryKey || '').trim().toUpperCase();

    if (trimmedKey.length > 0) {
      if (!record.recoveryCodeHash) {
        return {
          ok: false,
          statusCode: 400,
          error:
            'No admin recovery key is active for this account. Request a device recovery key from an administrator.',
        };
      }
      const candidateHash = hashSecretValue(trimmedKey, this.getSessionSecret());
      if (!timingSafeEqualHex(candidateHash, record.recoveryCodeHash)) {
        return {
          ok: false,
          statusCode: 400,
          error: 'Invalid device recovery key. Verify the key provided by your administrator.',
        };
      }

      const otherBound = this.findRegistrationByDeviceFingerprint(input.currentDeviceFingerprint);
      if (otherBound && otherBound.id !== record.id) {
        return {
          ok: false,
          statusCode: 409,
          error:
            'This device is already associated with a different MAXAGRAM account. One device per account is enforced.',
        };
      }

      record.deviceFingerprint = input.currentDeviceFingerprint;
      record.deviceShortId = input.currentDeviceShortId;
      record.devicePlatform = input.currentPlatform;
      record.deviceBrowser = input.currentBrowser;
      record.ipAddress = input.ipAddress;
      record.lastVerifiedAt = new Date().toISOString();
      record.recoveryCodeHash = null;
      record.recoveryIssuedAt = null;
      record.deviceResetRequired = false;
      this.persist();
      return { ok: true, record };
    }

    if (record.deviceResetRequired) {
      return {
        ok: false,
        statusCode: 403,
        error: 'An administrator reset your device binding. Enter your admin-issued Recovery Key to re-bind.',
      };
    }

    if (record.deviceFingerprint !== input.currentDeviceFingerprint) {
      return {
        ok: false,
        statusCode: 403,
        error:
          'This account is bound to a different device. Enter an admin-issued Device Recovery Key to authorize this device.',
      };
    }

    record.lastVerifiedAt = new Date().toISOString();
    record.ipAddress = input.ipAddress;
    this.persist();
    return { ok: true, record };
  }

  public deleteRegistration(regId: string): boolean {
    const target = this.data.registrations.find((r) => r.id === regId);
    if (!target) return false;
    this.data.registrations = this.data.registrations.filter((r) => r.id !== regId);
    this.data.preRegistrations = this.data.preRegistrations.filter(
      (p) =>
        p.emailNormalized !== target.emailNormalized &&
        p.deviceFingerprint !== target.deviceFingerprint
    );
    this.data.profiles = this.data.profiles.filter((p) => p.userId !== regId);
    this.data.follows = this.data.follows.filter(
      (f) => f.followerId !== regId && f.followingId !== regId
    );
    this.data.stories = this.data.stories.filter((s) => s.authorId !== regId);
    this.persist();
    return true;
  }

  public listRegistrationsForAdmin(filters?: {
    q?: string;
    status?: string;
  }): AdminRegistrationView[] {
    const q = (filters?.q || '').trim().toLowerCase();
    const statusFilter = (filters?.status || 'ALL').toUpperCase();

    return this.data.registrations
      .filter((reg) => {
        if (statusFilter === 'ACTIVE' && reg.status !== 'ACTIVE') return false;
        if (statusFilter === 'DISABLED' && reg.status !== 'DISABLED') return false;
        if (statusFilter === 'RECOVERY' && !reg.recoveryCodeHash) return false;
        if (!q) return true;
        return (
          reg.fullName.toLowerCase().includes(q) ||
          reg.email.toLowerCase().includes(q) ||
          reg.codeUsed.toLowerCase().includes(q) ||
          reg.deviceShortId.toLowerCase().includes(q) ||
          reg.devicePlatform.toLowerCase().includes(q) ||
          reg.deviceBrowser.toLowerCase().includes(q)
        );
      })
      .map((reg) => ({
        ...this.toPublicRegistration(reg),
        ipAddress: reg.ipAddress,
        deviceResetRequired: reg.deviceResetRequired,
        recoveryIssuedAt: reg.recoveryIssuedAt,
        downloadCount: this.data.downloadLogs.filter((l) => l.registrationId === reg.id).length,
      }));
  }

  public authenticateAdmin(email: string, password: string): StoredAdmin | null {
    const normalized = email.trim().toLowerCase();
    const admin = this.data.admins.find((a) => a.email === normalized);
    if (!admin) return null;
    if (!verifyPassword(password, admin.passwordHash)) return null;
    return admin;
  }

  public findAdminById(id: string): StoredAdmin | undefined {
    return this.data.admins.find((a) => a.id === id);
  }

  public listDownloads(filters?: {
    q?: string;
    category?: string;
    section?: string;
  }): DownloadItem[] {
    const q = (filters?.q || '').trim().toLowerCase();
    const cat = (filters?.category || '').trim();
    const section = (filters?.section || '').trim().toLowerCase();

    let results = [...this.data.downloads];

    if (cat && cat !== 'All') {
      results = results.filter((d) => d.category === cat);
    }

    if (q) {
      results = results.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          d.shortDescription.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.version.toLowerCase().includes(q)
      );
    }

    if (section === 'featured') {
      results = results.filter((d) => d.featured);
    } else if (section === 'popular') {
      results.sort((a, b) => b.downloadsCount - a.downloadsCount);
    } else if (section === 'latest') {
      results.sort((a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime());
    } else {
      results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    return results;
  }

  public getDownloadById(id: string): DownloadItem | undefined {
    return this.data.downloads.find((d) => d.id === id || d.slug === id);
  }

  public createDownload(payload: DownloadFormPayload): DownloadItem {
    const now = new Date().toISOString();
    const slugBase = payload.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'package';
    const uniqueSuffix = crypto.randomBytes(3).toString('hex');
    const id = `dl-${slugBase}-${uniqueSuffix}`;
    const safeFileName = payload.fileName.trim()
      ? payload.fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
      : `Maxagram_${slugBase}_${payload.version.trim()}.zip`;

    const defaultCoverByCategory: Record<DownloadCategory, string> = {
      'Creative Suites': COVER_CREATIVE,
      'Security & Privacy': COVER_SECURITY,
      'Media & Audio': COVER_AUDIO,
      'Developer Tools': COVER_DEV,
      'System Utilities': COVER_DEV,
      'Desktop Apps': COVER_CREATIVE,
    };

    const item: DownloadItem = {
      id,
      slug: `${slugBase}-${uniqueSuffix}`,
      title: payload.title.trim(),
      category: payload.category,
      version: payload.version.trim(),
      fileSize: payload.fileSize.trim(),
      fileName: safeFileName.endsWith('.zip') ? safeFileName : `${safeFileName}.zip`,
      shortDescription: payload.shortDescription.trim(),
      description: payload.description.trim(),
      releaseNotes: payload.releaseNotes.trim() || 'Initial MAXAGRAM verified release.',
      requirements: payload.requirements.trim() || 'Windows 10+ / macOS 13+ / Linux x64',
      sha256: generateSha256FromText(`${id}:${payload.version}:${safeFileName}:${now}`),
      coverImage: payload.coverImage.trim() || defaultCoverByCategory[payload.category],
      featured: Boolean(payload.featured),
      downloadsCount: 0,
      releasedAt: now,
      updatedAt: now,
    };

    this.data.downloads.unshift(item);
    this.persist();
    return item;
  }

  public updateDownload(id: string, payload: DownloadFormPayload): DownloadItem | null {
    const existing = this.data.downloads.find((d) => d.id === id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const safeFileName = payload.fileName.trim()
      ? payload.fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
      : existing.fileName;

    existing.title = payload.title.trim();
    existing.category = payload.category;
    existing.version = payload.version.trim();
    existing.fileSize = payload.fileSize.trim();
    existing.fileName = safeFileName.endsWith('.zip') ? safeFileName : `${safeFileName}.zip`;
    existing.shortDescription = payload.shortDescription.trim();
    existing.description = payload.description.trim();
    existing.releaseNotes = payload.releaseNotes.trim();
    existing.requirements = payload.requirements.trim();
    if (payload.coverImage.trim()) {
      existing.coverImage = payload.coverImage.trim();
    }
    existing.featured = Boolean(payload.featured);
    existing.updatedAt = now;
    existing.sha256 = generateSha256FromText(`${existing.id}:${existing.version}:${existing.fileName}:${now}`);

    this.persist();
    return existing;
  }

  public deleteDownload(id: string): boolean {
    const before = this.data.downloads.length;
    this.data.downloads = this.data.downloads.filter((d) => d.id !== id);
    if (this.data.downloads.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  public recordDownload(fileId: string, registration: StoredRegistration): DownloadItem | null {
    const item = this.data.downloads.find((d) => d.id === fileId);
    if (!item) return null;

    item.downloadsCount += 1;
    const logEntry: DownloadLog = {
      id: `log-${crypto.randomUUID()}`,
      fileId: item.id,
      fileTitle: item.title,
      fileVersion: item.version,
      registrationId: registration.id,
      userEmail: registration.email,
      deviceShortId: registration.deviceShortId,
      downloadedAt: new Date().toISOString(),
    };
    this.data.downloadLogs.unshift(logEntry);
    if (this.data.downloadLogs.length > 500) {
      this.data.downloadLogs = this.data.downloadLogs.slice(0, 500);
    }
    this.persist();
    return item;
  }

  public getAdminOverview(): AdminOverview {
    const totalUsers = this.data.registrations.length;
    const activeUsers = this.data.registrations.filter((r) => r.status === 'ACTIVE').length;
    const disabledUsers = this.data.registrations.filter((r) => r.status === 'DISABLED').length;
    const pendingPreRegistrations = this.data.preRegistrations.filter((p) => !p.redeemedAt).length;
    const recoveryPendingCount = this.data.registrations.filter((r) => Boolean(r.recoveryCodeHash)).length;
    const totalDownloads = this.data.downloads.reduce((sum, d) => sum + d.downloadsCount, 0);

    return {
      totalUsers,
      activeUsers,
      disabledUsers,
      pendingPreRegistrations,
      recoveryPendingCount,
      totalDownloads,
      totalFiles: this.data.downloads.length,
      registrationsEnabled: this.data.settings.registrationsEnabled,
      recentLogs: this.data.downloadLogs.slice(0, 25),
    };
  }

  // ============================================================================
  // SOCIAL PLATFORM: PROFILES, FOLLOWS, FEED POSTS, LIKES, COMMENTS, STORIES, DMs
  // ============================================================================

  private sanitizeUsername(raw: string): string {
    const cleaned = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._]+/g, '.')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 24);
    if (cleaned.length >= 3) return cleaned;
    return `member.${crypto.randomBytes(2).toString('hex')}`;
  }

  private allocateUniqueUsername(base: string, excludeUserId?: string): string {
    const sanitized = this.sanitizeUsername(base);
    const taken = new Set(
      this.data.profiles
        .filter((p) => p.userId !== excludeUserId)
        .map((p) => p.username.toLowerCase())
    );
    if (!taken.has(sanitized)) return sanitized;
    for (let i = 1; i <= 999; i += 1) {
      const candidate = `${sanitized.slice(0, 20)}${i}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `user.${crypto.randomBytes(3).toString('hex')}`;
  }

  private isSafeMediaUrl(url: string, allowHttps = false): boolean {
    if (!url) return false;
    if (url.startsWith('/api/social/media/') || url.startsWith('/src/assets/')) return true;
    if (url.startsWith('data:image/') || url.startsWith('data:video/')) return true;
    if (allowHttps && /^https:\/\//i.test(url)) return true;
    return false;
  }

  public ensureProfileForRegistration(
    reg: StoredRegistration,
    persistIfCreated = true
  ): StoredSocialProfile {
    const existing = this.data.profiles.find((p) => p.userId === reg.id);
    if (existing) return existing;

    const created: StoredSocialProfile = {
      userId: reg.id,
      username: this.allocateUniqueUsername(reg.fullName || reg.email.split('@')[0] || 'member'),
      displayName: reg.fullName,
      bio: '',
      location: '',
      website: '',
      avatarUrl: '',
      joinedAt: reg.registeredAt,
    };
    this.data.profiles.push(created);
    if (persistIfCreated) {
      this.persist();
    }
    return created;
  }

  private resolveProfileRecord(userId: string): StoredSocialProfile | null {
    const existing = this.data.profiles.find((p) => p.userId === userId);
    if (existing) return existing;
    const reg = this.findRegistrationById(userId);
    if (reg) {
      return this.ensureProfileForRegistration(reg, true);
    }
    return null;
  }

  private toPublicProfile(
    profile: StoredSocialProfile,
    viewerId: string,
    onlineUserIds?: ReadonlySet<string>
  ): SocialProfile {
    const followersCount = this.data.follows.filter((f) => f.followingId === profile.userId).length;
    const followingCount = this.data.follows.filter((f) => f.followerId === profile.userId).length;
    const postsCount = this.data.posts.filter((p) => p.authorId === profile.userId).length;
    const isFollowing = this.data.follows.some(
      (f) => f.followerId === viewerId && f.followingId === profile.userId
    );
    return {
      userId: profile.userId,
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      location: profile.location,
      website: profile.website,
      avatarUrl: profile.avatarUrl,
      joinedAt: profile.joinedAt,
      followersCount,
      followingCount,
      postsCount,
      isFollowing,
      isSelf: profile.userId === viewerId,
      isOnline: onlineUserIds ? onlineUserIds.has(profile.userId) : false,
    };
  }

  public getSocialProfile(
    targetUserId: string,
    viewerId: string,
    onlineUserIds?: ReadonlySet<string>
  ): SocialProfile | null {
    const record = this.resolveProfileRecord(targetUserId);
    if (!record) return null;
    return this.toPublicProfile(record, viewerId, onlineUserIds);
  }

  public listSocialProfiles(
    viewerId: string,
    query?: string,
    onlineUserIds?: ReadonlySet<string>
  ): SocialProfile[] {
    // Ensure every registered user has a profile
    let createdAny = false;
    for (const reg of this.data.registrations) {
      if (!this.data.profiles.some((p) => p.userId === reg.id)) {
        this.ensureProfileForRegistration(reg, false);
        createdAny = true;
      }
    }
    if (createdAny) {
      this.persist();
    }

    const q = (query || '').trim().toLowerCase();
    return this.data.profiles
      .filter((p) => {
        if (!q) return true;
        return (
          p.displayName.toLowerCase().includes(q) ||
          p.username.toLowerCase().includes(q) ||
          p.bio.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q)
        );
      })
      .map((p) => this.toPublicProfile(p, viewerId, onlineUserIds))
      .sort((a, b) => {
        if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
        if (b.followersCount !== a.followersCount) return b.followersCount - a.followersCount;
        return a.displayName.localeCompare(b.displayName);
      });
  }

  public updateSocialProfile(
    userId: string,
    patch: {
      displayName?: string;
      username?: string;
      bio?: string;
      location?: string;
      website?: string;
      avatarUrl?: string;
    },
    onlineUserIds?: ReadonlySet<string>
  ): { ok: true; profile: SocialProfile } | { ok: false; statusCode: number; error: string } {
    const record = this.resolveProfileRecord(userId);
    if (!record) {
      return { ok: false, statusCode: 404, error: 'Profile not found.' };
    }

    if (typeof patch.displayName === 'string') {
      const name = patch.displayName.trim();
      if (name.length < 2 || name.length > 60) {
        return {
          ok: false,
          statusCode: 400,
          error: 'Display name must be between 2 and 60 characters.',
        };
      }
      record.displayName = name;
    }

    if (typeof patch.username === 'string') {
      const uname = patch.username.trim().toLowerCase();
      if (!/^[a-z0-9._]{3,24}$/.test(uname)) {
        return {
          ok: false,
          statusCode: 400,
          error: 'Username must be 3–24 characters using lowercase letters, numbers, dots, or underscores.',
        };
      }
      const conflict = this.data.profiles.find(
        (p) => p.userId !== userId && p.username.toLowerCase() === uname
      );
      if (conflict) {
        return {
          ok: false,
          statusCode: 409,
          error: `Username @${uname} is already taken.`,
        };
      }
      record.username = uname;
    }

    if (typeof patch.bio === 'string') {
      const bio = patch.bio.trim();
      if (bio.length > 280) {
        return { ok: false, statusCode: 400, error: 'Bio must be 280 characters or fewer.' };
      }
      record.bio = bio;
    }

    if (typeof patch.location === 'string') {
      record.location = patch.location.trim().slice(0, 80);
    }

    if (typeof patch.website === 'string') {
      record.website = patch.website.trim().slice(0, 120);
    }

    if (typeof patch.avatarUrl === 'string') {
      const trimmed = patch.avatarUrl.trim();
      if (trimmed.length > 0 && !this.isSafeMediaUrl(trimmed, true)) {
        return { ok: false, statusCode: 400, error: 'Invalid avatar image URL.' };
      }
      record.avatarUrl = trimmed;
    }

    this.persist();
    return {
      ok: true,
      profile: this.toPublicProfile(record, userId, onlineUserIds),
    };
  }

  public toggleFollow(
    followerId: string,
    targetUserId: string
  ):
    | { ok: true; following: boolean; followersCount: number; followingCount: number }
    | { ok: false; statusCode: number; error: string } {
    if (followerId === targetUserId) {
      return { ok: false, statusCode: 400, error: 'You cannot follow your own profile.' };
    }
    const target = this.resolveProfileRecord(targetUserId);
    if (!target) {
      return { ok: false, statusCode: 404, error: 'Target profile not found.' };
    }

    const idx = this.data.follows.findIndex(
      (f) => f.followerId === followerId && f.followingId === targetUserId
    );
    let following: boolean;
    if (idx >= 0) {
      this.data.follows.splice(idx, 1);
      following = false;
    } else {
      this.data.follows.push({
        followerId,
        followingId: targetUserId,
        createdAt: new Date().toISOString(),
      });
      following = true;
    }

    this.persist();
    const followersCount = this.data.follows.filter((f) => f.followingId === targetUserId).length;
    const followingCount = this.data.follows.filter((f) => f.followerId === followerId).length;
    return { ok: true, following, followersCount, followingCount };
  }

  private toPublicComment(
    comment: StoredComment,
    postAuthorId: string,
    viewerId: string
  ): PostComment {
    const author = this.resolveProfileRecord(comment.authorId);
    return {
      id: comment.id,
      postId: comment.postId,
      authorId: comment.authorId,
      authorName: author?.displayName || 'MAXAGRAM Member',
      authorUsername: author?.username || 'member',
      authorAvatar: author?.avatarUrl || '',
      text: comment.text,
      createdAt: comment.createdAt,
      canDelete: comment.authorId === viewerId || postAuthorId === viewerId,
    };
  }

  private toPublicPost(post: StoredPost, viewerId: string): FeedPost {
    const author = this.resolveProfileRecord(post.authorId);
    return {
      id: post.id,
      authorId: post.authorId,
      authorName: author?.displayName || 'MAXAGRAM Member',
      authorUsername: author?.username || 'member',
      authorAvatar: author?.avatarUrl || '',
      mediaType: post.mediaType,
      mediaUrl: post.mediaUrl,
      posterUrl: post.posterUrl,
      caption: post.caption,
      location: post.location,
      likesCount: post.likedBy.length,
      likedByMe: post.likedBy.includes(viewerId),
      commentsCount: post.comments.length,
      comments: post.comments.map((c) => this.toPublicComment(c, post.authorId, viewerId)),
      createdAt: post.createdAt,
      canDelete: post.authorId === viewerId,
    };
  }

  public listFeedPosts(
    viewerId: string,
    options?: {
      filter?: 'all' | 'following' | 'image' | 'video';
      authorId?: string;
    }
  ): FeedPost[] {
    const filter = options?.filter || 'all';
    const authorId = options?.authorId?.trim();
    const followingSet = new Set(
      this.data.follows.filter((f) => f.followerId === viewerId).map((f) => f.followingId)
    );

    return this.data.posts
      .filter((post) => {
        if (authorId && post.authorId !== authorId) return false;
        if (filter === 'following') {
          return post.authorId === viewerId || followingSet.has(post.authorId);
        }
        if (filter === 'image') return post.mediaType === 'image';
        if (filter === 'video') return post.mediaType === 'video';
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((post) => this.toPublicPost(post, viewerId));
  }

  public getFeedPostById(postId: string, viewerId: string): FeedPost | null {
    const post = this.data.posts.find((p) => p.id === postId);
    if (!post) return null;
    return this.toPublicPost(post, viewerId);
  }

  public createPost(
    authorId: string,
    input: {
      mediaType: PostMediaType;
      mediaUrl: string;
      posterUrl?: string;
      caption?: string;
      location?: string;
    }
  ): { ok: true; post: FeedPost } | { ok: false; statusCode: number; error: string } {
    if (input.mediaType !== 'image' && input.mediaType !== 'video') {
      return { ok: false, statusCode: 400, error: 'Media type must be image or video.' };
    }
    const mediaUrl = (input.mediaUrl || '').trim();
    if (!this.isSafeMediaUrl(mediaUrl, false)) {
      return { ok: false, statusCode: 400, error: 'Please upload a valid photo or video first.' };
    }
    const posterUrl = input.posterUrl?.trim();
    if (posterUrl && !this.isSafeMediaUrl(posterUrl, false)) {
      return { ok: false, statusCode: 400, error: 'Invalid video preview thumbnail.' };
    }
    const caption = (input.caption || '').trim().slice(0, 1000);
    const location = (input.location || '').trim().slice(0, 80);

    this.resolveProfileRecord(authorId);

    const record: StoredPost = {
      id: `post-${crypto.randomUUID()}`,
      authorId,
      mediaType: input.mediaType,
      mediaUrl,
      posterUrl: posterUrl || undefined,
      caption,
      location,
      likedBy: [],
      comments: [],
      createdAt: new Date().toISOString(),
    };
    this.data.posts.unshift(record);
    this.persist();
    return { ok: true, post: this.toPublicPost(record, authorId) };
  }

  public deletePost(
    postId: string,
    userId: string
  ): { ok: true } | { ok: false; statusCode: number; error: string } {
    const post = this.data.posts.find((p) => p.id === postId);
    if (!post) {
      return { ok: false, statusCode: 404, error: 'Post not found.' };
    }
    if (post.authorId !== userId) {
      return { ok: false, statusCode: 403, error: 'You can only delete your own posts.' };
    }
    this.data.posts = this.data.posts.filter((p) => p.id !== postId);
    this.persist();
    return { ok: true };
  }

  public togglePostLike(
    postId: string,
    userId: string
  ): { ok: true; liked: boolean; likesCount: number } | { ok: false; statusCode: number; error: string } {
    const post = this.data.posts.find((p) => p.id === postId);
    if (!post) {
      return { ok: false, statusCode: 404, error: 'Post not found.' };
    }
    const idx = post.likedBy.indexOf(userId);
    let liked: boolean;
    if (idx >= 0) {
      post.likedBy.splice(idx, 1);
      liked = false;
    } else {
      post.likedBy.push(userId);
      liked = true;
    }
    this.persist();
    return { ok: true, liked, likesCount: post.likedBy.length };
  }

  public addPostComment(
    postId: string,
    authorId: string,
    text: string
  ):
    | { ok: true; comment: PostComment; commentsCount: number }
    | { ok: false; statusCode: number; error: string } {
    const post = this.data.posts.find((p) => p.id === postId);
    if (!post) {
      return { ok: false, statusCode: 404, error: 'Post not found.' };
    }
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      return { ok: false, statusCode: 400, error: 'Comment must be between 1 and 500 characters.' };
    }
    this.resolveProfileRecord(authorId);
    const stored: StoredComment = {
      id: `cmt-${crypto.randomUUID()}`,
      postId: post.id,
      authorId,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    post.comments.push(stored);
    this.persist();
    return {
      ok: true,
      comment: this.toPublicComment(stored, post.authorId, authorId),
      commentsCount: post.comments.length,
    };
  }

  public deletePostComment(
    postId: string,
    commentId: string,
    userId: string
  ): { ok: true; commentsCount: number } | { ok: false; statusCode: number; error: string } {
    const post = this.data.posts.find((p) => p.id === postId);
    if (!post) {
      return { ok: false, statusCode: 404, error: 'Post not found.' };
    }
    const comment = post.comments.find((c) => c.id === commentId);
    if (!comment) {
      return { ok: false, statusCode: 404, error: 'Comment not found.' };
    }
    if (comment.authorId !== userId && post.authorId !== userId) {
      return { ok: false, statusCode: 403, error: 'You cannot delete this comment.' };
    }
    post.comments = post.comments.filter((c) => c.id !== commentId);
    this.persist();
    return { ok: true, commentsCount: post.comments.length };
  }

  private toPublicStory(story: StoredStory, viewerId: string): StoryItem {
    const author = this.resolveProfileRecord(story.authorId);
    return {
      id: story.id,
      authorId: story.authorId,
      authorName: author?.displayName || 'MAXAGRAM Member',
      authorUsername: author?.username || 'member',
      authorAvatar: author?.avatarUrl || '',
      mediaType: story.mediaType,
      mediaUrl: story.mediaUrl,
      caption: story.caption,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
      viewsCount: story.viewedBy.length,
      viewedByMe: story.viewedBy.includes(viewerId),
      canDelete: story.authorId === viewerId,
    };
  }

  public listActiveStoryGroups(viewerId: string): StoryGroup[] {
    const nowMs = Date.now();
    const activeStories = this.data.stories.filter(
      (s) => new Date(s.expiresAt).getTime() > nowMs
    );

    const grouped = new Map<string, StoredStory[]>();
    for (const story of activeStories) {
      const list = grouped.get(story.authorId) || [];
      list.push(story);
      grouped.set(story.authorId, list);
    }

    const groups: Array<{ group: StoryGroup; latestMs: number }> = [];
    for (const [authorId, list] of grouped.entries()) {
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const publicItems = list.map((s) => this.toPublicStory(s, viewerId));
      const author = this.resolveProfileRecord(authorId);
      const latestMs = new Date(list[list.length - 1].createdAt).getTime();
      const hasUnseen = publicItems.some((s) => !s.viewedByMe);

      groups.push({
        latestMs,
        group: {
          authorId,
          authorName: author?.displayName || 'MAXAGRAM Member',
          authorUsername: author?.username || 'member',
          authorAvatar: author?.avatarUrl || '',
          hasUnseen,
          stories: publicItems,
        },
      });
    }

    groups.sort((a, b) => {
      const aSelf = a.group.authorId === viewerId;
      const bSelf = b.group.authorId === viewerId;
      if (aSelf !== bSelf) return aSelf ? -1 : 1;
      if (a.group.hasUnseen !== b.group.hasUnseen) return a.group.hasUnseen ? -1 : 1;
      return b.latestMs - a.latestMs;
    });

    return groups.map((g) => g.group);
  }

  public createStory(
    authorId: string,
    input: { mediaType: PostMediaType; mediaUrl: string; caption?: string }
  ): { ok: true; story: StoryItem } | { ok: false; statusCode: number; error: string } {
    if (input.mediaType !== 'image' && input.mediaType !== 'video') {
      return { ok: false, statusCode: 400, error: 'Story media must be a photo or video.' };
    }
    const mediaUrl = (input.mediaUrl || '').trim();
    if (!this.isSafeMediaUrl(mediaUrl, false)) {
      return { ok: false, statusCode: 400, error: 'Please upload a valid photo or video for your story.' };
    }
    const caption = (input.caption || '').trim().slice(0, 220);
    this.resolveProfileRecord(authorId);

    const now = Date.now();
    const record: StoredStory = {
      id: `story-${crypto.randomUUID()}`,
      authorId,
      mediaType: input.mediaType,
      mediaUrl,
      caption,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      viewedBy: [authorId],
    };
    this.data.stories.push(record);
    this.persist();
    return { ok: true, story: this.toPublicStory(record, authorId) };
  }

  public markStoryViewed(
    storyId: string,
    viewerId: string
  ): { ok: true; viewsCount: number } | { ok: false; statusCode: number; error: string } {
    const story = this.data.stories.find((s) => s.id === storyId);
    if (!story) {
      return { ok: false, statusCode: 404, error: 'Story not found.' };
    }
    if (!story.viewedBy.includes(viewerId)) {
      story.viewedBy.push(viewerId);
      this.persist();
    }
    return { ok: true, viewsCount: story.viewedBy.length };
  }

  public deleteStory(
    storyId: string,
    userId: string
  ): { ok: true } | { ok: false; statusCode: number; error: string } {
    const story = this.data.stories.find((s) => s.id === storyId);
    if (!story) {
      return { ok: false, statusCode: 404, error: 'Story not found.' };
    }
    if (story.authorId !== userId) {
      return { ok: false, statusCode: 403, error: 'You can only delete your own stories.' };
    }
    this.data.stories = this.data.stories.filter((s) => s.id !== storyId);
    this.persist();
    return { ok: true };
  }

  public listConversations(
    userId: string,
    onlineUserIds?: ReadonlySet<string>
  ): { conversations: ConversationSummary[]; totalUnread: number } {
    const byPeer = new Map<
      string,
      { lastMessage: StoredDirectMessage; unreadCount: number; conversationId: string }
    >();

    for (const msg of this.data.messages) {
      if (msg.senderId !== userId && msg.recipientId !== userId) continue;
      const peerId = msg.senderId === userId ? msg.recipientId : msg.senderId;
      const existing = byPeer.get(peerId);
      const isUnread = msg.recipientId === userId && msg.readAt === null;

      if (!existing) {
        byPeer.set(peerId, {
          conversationId: msg.conversationId,
          lastMessage: msg,
          unreadCount: isUnread ? 1 : 0,
        });
      } else {
        if (isUnread) existing.unreadCount += 1;
        if (new Date(msg.createdAt).getTime() >= new Date(existing.lastMessage.createdAt).getTime()) {
          existing.lastMessage = msg;
        }
      }
    }

    const conversations: ConversationSummary[] = [];
    let totalUnread = 0;
    for (const [peerId, entry] of byPeer.entries()) {
      const peerProfile = this.getSocialProfile(peerId, userId, onlineUserIds);
      if (!peerProfile) continue;
      totalUnread += entry.unreadCount;
      conversations.push({
        conversationId: entry.conversationId,
        peer: peerProfile,
        lastMessage: { ...entry.lastMessage },
        unreadCount: entry.unreadCount,
        updatedAt: entry.lastMessage.createdAt,
      });
    }

    conversations.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return { conversations, totalUnread };
  }

  public getConversationMessages(
    userId: string,
    peerId: string,
    onlineUserIds?: ReadonlySet<string>
  ):
    | {
        ok: true;
        conversationId: string;
        peer: SocialProfile;
        messages: DirectMessage[];
        markedReadAt: string | null;
      }
    | { ok: false; statusCode: number; error: string } {
    if (userId === peerId) {
      return { ok: false, statusCode: 400, error: 'Select another member to start a conversation.' };
    }
    const peer = this.getSocialProfile(peerId, userId, onlineUserIds);
    if (!peer) {
      return { ok: false, statusCode: 404, error: 'Recipient profile not found.' };
    }

    const conversationId = buildConversationId(userId, peerId);
    const nowIso = new Date().toISOString();
    let markedAny = false;

    const messages = this.data.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((m) => {
        if (m.recipientId === userId && m.readAt === null) {
          m.readAt = nowIso;
          markedAny = true;
        }
        return { ...m };
      });

    if (markedAny) {
      this.persist();
    }

    return {
      ok: true,
      conversationId,
      peer,
      messages,
      markedReadAt: markedAny ? nowIso : null,
    };
  }

  public sendDirectMessage(
    senderId: string,
    recipientId: string,
    input: {
      text?: string;
      mediaType?: PostMediaType;
      mediaUrl?: string;
      storyRefId?: string;
    }
  ): { ok: true; message: DirectMessage } | { ok: false; statusCode: number; error: string } {
    if (senderId === recipientId) {
      return { ok: false, statusCode: 400, error: 'You cannot send a direct message to yourself.' };
    }
    const recipient = this.resolveProfileRecord(recipientId);
    if (!recipient) {
      return { ok: false, statusCode: 404, error: 'Recipient profile not found.' };
    }

    const text = (input.text || '').trim().slice(0, 2000);
    const mediaUrl = input.mediaUrl?.trim();
    const mediaType = input.mediaType;

    if (!text && !mediaUrl) {
      return { ok: false, statusCode: 400, error: 'Enter a message or attach a photo/video.' };
    }

    if (mediaUrl) {
      if (mediaType !== 'image' && mediaType !== 'video') {
        return { ok: false, statusCode: 400, error: 'Attachment media type must be image or video.' };
      }
      if (!this.isSafeMediaUrl(mediaUrl, false)) {
        return { ok: false, statusCode: 400, error: 'Invalid media attachment URL.' };
      }
    }

    this.resolveProfileRecord(senderId);

    const record: StoredDirectMessage = {
      id: `dm-${crypto.randomUUID()}`,
      conversationId: buildConversationId(senderId, recipientId),
      senderId,
      recipientId,
      text,
      mediaType: mediaUrl ? mediaType : undefined,
      mediaUrl: mediaUrl || undefined,
      storyRefId: input.storyRefId?.trim() || undefined,
      createdAt: new Date().toISOString(),
      readAt: null,
    };

    this.data.messages.push(record);
    if (this.data.messages.length > 5000) {
      this.data.messages = this.data.messages.slice(-5000);
    }
    this.persist();
    return { ok: true, message: { ...record } };
  }
}

export const db = new MaxagramDatabase();
