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

export interface PublicPreRegistration {
  id: string;
  fullName: string;
  email: string;
  deviceShortId: string;
  devicePlatform: string;
  deviceBrowser: string;
  createdAt: string;
  redeemed: boolean;
}

export type DeviceCheckStatus =
  | 'ACTIVE'
  | 'UNREGISTERED'
  | 'PRE_REGISTERED'
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
  pendingPreRegistrations: number;
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

// ============================================================================
// SOCIAL PLATFORM TYPES (PROFILES, FEED, LIKES/COMMENTS, STORIES, DMs)
// ============================================================================

export type PostMediaType = 'image' | 'video';

export interface SocialProfile {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  location: string;
  website: string;
  avatarUrl: string;
  joinedAt: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isFollowing: boolean;
  isSelf: boolean;
  isOnline?: boolean;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  text: string;
  createdAt: string;
  canDelete: boolean;
}

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  mediaType: PostMediaType;
  mediaUrl: string;
  posterUrl?: string;
  caption: string;
  location: string;
  likesCount: number;
  likedByMe: boolean;
  commentsCount: number;
  comments: PostComment[];
  createdAt: string;
  canDelete: boolean;
}

export interface StoryItem {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  mediaType: PostMediaType;
  mediaUrl: string;
  caption: string;
  createdAt: string;
  expiresAt: string;
  viewsCount: number;
  viewedByMe: boolean;
  canDelete: boolean;
}

export interface StoryGroup {
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  hasUnseen: boolean;
  stories: StoryItem[];
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  text: string;
  mediaType?: PostMediaType;
  mediaUrl?: string;
  storyRefId?: string;
  createdAt: string;
  readAt: string | null;
}

export interface ConversationSummary {
  conversationId: string;
  peer: SocialProfile;
  lastMessage: DirectMessage | null;
  unreadCount: number;
  updatedAt: string;
}

export type RealtimeEvent =
  | { type: 'presence:update'; onlineUserIds: string[] }
  | { type: 'post:created'; postId: string; authorId: string }
  | { type: 'post:liked'; postId: string; likesCount: number; userId: string; liked: boolean }
  | { type: 'post:commented'; postId: string; comment: Omit<PostComment, 'canDelete'>; commentsCount: number }
  | { type: 'post:comment_deleted'; postId: string; commentId: string; commentsCount: number }
  | { type: 'post:deleted'; postId: string }
  | { type: 'story:created'; authorId: string; storyId: string }
  | { type: 'story:deleted'; storyId: string }
  | { type: 'dm:message'; message: DirectMessage }
  | { type: 'dm:read'; conversationId: string; readerId: string; readAt: string }
  | { type: 'profile:updated'; userId: string }
  | { type: 'profile:followed'; targetUserId: string; followerId: string; following: boolean; followersCount: number };
