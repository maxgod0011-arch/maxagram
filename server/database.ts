import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AdminOverview,
  AdminRegistrationView,
  DownloadCategory,
  DownloadFormPayload,
  DownloadItem,
  DownloadLog,
  PublicRegistration,
  RegistrationStatus,
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
  registrations: StoredRegistration[];
  downloads: DownloadItem[];
  downloadLogs: DownloadLog[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'maxagram-store.json');

const COVER_CREATIVE = '/src/assets/images/cover_creative_suite_1795098371414.jpg';
const COVER_SECURITY = '/src/assets/images/cover_security_vault_1795098371647.jpg';
const COVER_AUDIO = '/src/assets/images/cover_audio_studio_1795098371788.jpg';
const COVER_DEV = '/src/assets/images/cover_dev_tools_1795098371181.jpg';

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

function createInitialDatabase(): DatabaseSchema {
  const sessionSecret =
    process.env.MAXAGRAM_SESSION_SECRET && process.env.MAXAGRAM_SESSION_SECRET.length >= 16
      ? process.env.MAXAGRAM_SESSION_SECRET
      : crypto.randomBytes(32).toString('hex');

  const adminEmail = (process.env.MAXAGRAM_ADMIN_EMAIL || 'admin@maxagram.io').trim().toLowerCase();
  const adminPassword = process.env.MAXAGRAM_ADMIN_PASSWORD || 'MaxagramAdmin#2026';

  const seededRegistrations: StoredRegistration[] = [
    {
      id: 'reg-seed-101',
      fullName: 'Elena Vance',
      email: 'elena.vance@studio-nord.io',
      emailNormalized: 'elena.vance@studio-nord.io',
      status: 'ACTIVE',
      codeUsed: OFFICIAL_REGISTRATION_CODE,
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
      codeUsed: OFFICIAL_REGISTRATION_CODE,
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
      codeUsed: OFFICIAL_REGISTRATION_CODE,
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

  return {
    version: 1,
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
    registrations: seededRegistrations,
    downloads: createSeedDownloads(),
    downloadLogs: seededLogs,
  };
}

class MaxagramDatabase {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadFromDisk();
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
          return parsed;
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
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(target, null, 2), 'utf8');
    fs.renameSync(tmpPath, DB_FILE);
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

  public createRegistration(input: {
    fullName: string;
    email: string;
    deviceFingerprint: string;
    deviceShortId: string;
    devicePlatform: string;
    deviceBrowser: string;
    ipAddress: string;
  }): StoredRegistration {
    const now = new Date().toISOString();
    const record: StoredRegistration = {
      id: `reg-${crypto.randomUUID()}`,
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      emailNormalized: input.email.trim().toLowerCase(),
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
    this.persist();
    return record;
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

    // Path 1: Admin-issued recovery key (works across hardware changes or after admin reset)
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

      // Ensure the target device is not already bound to another active account
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

    // Path 2: Same hardware-bound device restoring session after clearing browser cookies/storage
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
    const before = this.data.registrations.length;
    this.data.registrations = this.data.registrations.filter((r) => r.id !== regId);
    if (this.data.registrations.length !== before) {
      this.persist();
      return true;
    }
    return false;
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
    const recoveryPendingCount = this.data.registrations.filter((r) => Boolean(r.recoveryCodeHash)).length;
    const totalDownloads = this.data.downloads.reduce((sum, d) => sum + d.downloadsCount, 0);

    return {
      totalUsers,
      activeUsers,
      disabledUsers,
      recoveryPendingCount,
      totalDownloads,
      totalFiles: this.data.downloads.length,
      registrationsEnabled: this.data.settings.registrationsEnabled,
      recentLogs: this.data.downloadLogs.slice(0, 25),
    };
  }
}

export const db = new MaxagramDatabase();
