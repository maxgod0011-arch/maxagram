export type DownloadCategory =
  | 'Desktop Apps'
  | 'Developer Tools'
  | 'Creative Suites'
  | 'System Utilities'
  | 'Security & Privacy'
  | 'Media & Audio';

export const DOWNLOAD_CATEGORIES: readonly DownloadCategory[] = [
  'Desktop Apps',
  'Developer Tools',
  'Creative Suites',
  'System Utilities',
  'Security & Privacy',
  'Media & Audio',
] as const;

export type RegistrationStatus = 'ACTIVE' | 'DISABLED';

export interface DownloadItem {
  id: string;
  slug: string;
  title: string;
  category: DownloadCategory;
  version: string;
  fileSize: string;
  fileName: string;
  shortDescription: string;
  description: string;
  releaseNotes: string;
  requirements: string;
  sha256: string;
  coverImage: string;
  featured: boolean;
  downloadsCount: number;
  releasedAt: string;
  updatedAt: string;
}

export interface PublicRegistration {
  id: string;
  fullName: string;
  email: string;
  status: RegistrationStatus;
  codeUsed: string;
  deviceShortId: string;
  devicePlatform: string;
  deviceBrowser: string;
  registeredAt: string;
  lastVerifiedAt: string;
  recoveryPending: boolean;
}

export interface AdminRegistrationView extends PublicRegistration {
  ipAddress: string;
  deviceResetRequired: boolean;
  recoveryIssuedAt: string | null;
  downloadCount: number;
}

export interface DownloadLog {
  id: string;
  fileId: string;
  fileTitle: string;
  fileVersion: string;
  registrationId: string;
  userEmail: string;
  deviceShortId: string;
  downloadedAt: string;
}

export interface DeviceSignals {
  clientHash: string;
  platform: string;
  browser: string;
  screen: string;
  timezone: string;
  language: string;
}

export type DeviceCheckStatus =
  | 'ACTIVE'
  | 'UNREGISTERED'
  | 'DISABLED'
  | 'SESSION_CLEARED_DEVICE_BOUND'
  | 'DEVICE_MISMATCH';

export interface DeviceCheckResponse {
  registered: boolean;
  status: DeviceCheckStatus;
  registrationsEnabled: boolean;
  deviceIdPreview: string;
  deviceAlreadyRegistered: boolean;
  maskedEmail?: string;
  recoveryPending?: boolean;
  message?: string;
  registration?: PublicRegistration;
  token?: string;
}

export interface AdminOverview {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  recoveryPendingCount: number;
  totalDownloads: number;
  totalFiles: number;
  registrationsEnabled: boolean;
  recentLogs: DownloadLog[];
}

export interface DownloadFormPayload {
  title: string;
  category: DownloadCategory;
  version: string;
  fileSize: string;
  fileName: string;
  shortDescription: string;
  description: string;
  releaseNotes: string;
  requirements: string;
  coverImage: string;
  featured: boolean;
}
