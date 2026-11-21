import type {
  AdminOverview,
  AdminRegistrationView,
  ConversationSummary,
  DeviceCheckResponse,
  DirectMessage,
  DownloadCategory,
  DownloadFormPayload,
  DownloadItem,
  FeedPost,
  PostComment,
  PostMediaType,
  PublicPreRegistration,
  PublicRegistration,
  RegistrationStatus,
  SocialProfile,
  StoryGroup,
  StoryItem,
} from '../../shared/types';
import { getDeviceSignals } from './device';

const USER_TOKEN_KEY = 'maxagram_session_token';
const ADMIN_TOKEN_KEY = 'maxagram_admin_token';

export function getStoredUserToken(): string | null {
  return readStoredToken(USER_TOKEN_KEY);
}

function readStoredToken(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key) || window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredToken(key: string, token: string | null): void {
  try {
    if (token) {
      window.sessionStorage.setItem(key, token);
      if (key === USER_TOKEN_KEY) {
        window.localStorage.setItem(key, token);
      }
    } else {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable in strict privacy contexts; HttpOnly cookie remains active.
  }
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiRequest<T>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    includeUserAuth?: boolean;
    includeAdminAuth?: boolean;
    includeDeviceHeader?: boolean;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.includeUserAuth) {
    const token = readStoredToken(USER_TOKEN_KEY);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  if (options.includeAdminAuth) {
    const adminToken = readStoredToken(ADMIN_TOKEN_KEY);
    if (adminToken) {
      headers['X-Admin-Token'] = adminToken;
    }
  }

  if (options.includeDeviceHeader) {
    const signals = await getDeviceSignals();
    headers['X-Device-Signals'] = JSON.stringify(signals);
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      data?.error || 'Request could not be completed. Please try again.',
      response.status,
      data?.code
    );
  }
  return data as T;
}

export async function checkDeviceRegistration(): Promise<DeviceCheckResponse> {
  const signals = await getDeviceSignals();
  const result = await apiRequest<DeviceCheckResponse>('/api/auth/device-check', {
    method: 'POST',
    body: { signals },
    includeUserAuth: true,
  });
  if (result.registered && result.token) {
    writeStoredToken(USER_TOKEN_KEY, result.token);
  } else if (!result.registered) {
    writeStoredToken(USER_TOKEN_KEY, null);
  }
  return result;
}

export async function preRegisterDevice(input?: {
  fullName?: string;
  email?: string;
}): Promise<{
  success: boolean;
  uniqueCode: string;
  preRegistration: PublicPreRegistration;
  message: string;
}> {
  const signals = await getDeviceSignals();
  return apiRequest<{
    success: boolean;
    uniqueCode: string;
    preRegistration: PublicPreRegistration;
    message: string;
  }>('/api/auth/pre-register', {
    method: 'POST',
    body: { ...(input || {}), signals },
  });
}

export async function registerDevice(input: {
  fullName?: string;
  email: string;
  registrationCode: string;
}): Promise<{ success: boolean; registration: PublicRegistration; token: string; message: string }> {
  const signals = await getDeviceSignals();
  const result = await apiRequest<{
    success: boolean;
    registration: PublicRegistration;
    token: string;
    message: string;
  }>('/api/auth/register', {
    method: 'POST',
    body: { ...input, signals },
  });
  if (result.token) {
    writeStoredToken(USER_TOKEN_KEY, result.token);
  }
  return result;
}

export async function recoverDeviceAccess(input: {
  email: string;
  recoveryKey?: string;
}): Promise<{ success: boolean; registration: PublicRegistration; token: string; message: string }> {
  const signals = await getDeviceSignals();
  const result = await apiRequest<{
    success: boolean;
    registration: PublicRegistration;
    token: string;
    message: string;
  }>('/api/auth/recover', {
    method: 'POST',
    body: { ...input, signals },
  });
  if (result.token) {
    writeStoredToken(USER_TOKEN_KEY, result.token);
  }
  return result;
}

export async function logoutUserSession(): Promise<void> {
  await apiRequest('/api/auth/logout', { method: 'POST', includeUserAuth: true });
  writeStoredToken(USER_TOKEN_KEY, null);
}

export async function fetchCatalog(params?: {
  q?: string;
  category?: string;
  section?: string;
}): Promise<{
  items: DownloadItem[];
  categories: DownloadCategory[];
  totalCount: number;
  registration: PublicRegistration | null;
}> {
  const query = new URLSearchParams();
  if (params?.q) query.set('q', params.q);
  if (params?.category) query.set('category', params.category);
  if (params?.section) query.set('section', params.section);
  const qs = query.toString();
  return apiRequest(`/api/catalog${qs ? `?${qs}` : ''}`, {
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function fetchDownloadById(id: string): Promise<{ item: DownloadItem }> {
  return apiRequest(`/api/downloads/${encodeURIComponent(id)}`, {
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function downloadVerifiedPackage(item: DownloadItem): Promise<number> {
  const signals = await getDeviceSignals();
  const headers: Record<string, string> = {
    'X-Device-Signals': JSON.stringify(signals),
  };
  const token = readStoredToken(USER_TOKEN_KEY);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`/api/downloads/${encodeURIComponent(item.id)}/file`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new ApiError(
      err?.error || 'Download authorization failed. Please re-verify your device.',
      response.status,
      err?.code
    );
  }

  const updatedCountHeader = response.headers.get('X-Maxagram-Downloads');
  const updatedCount = updatedCountHeader ? Number(updatedCountHeader) : item.downloadsCount + 1;

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = item.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);

  return Number.isFinite(updatedCount) ? updatedCount : item.downloadsCount + 1;
}

// ============================================================================
// ADMIN API CALLS
// ============================================================================

export async function checkAdminSession(): Promise<{
  authenticated: boolean;
  admin?: { id: string; email: string; name: string };
}> {
  return apiRequest('/api/admin/session', { includeAdminAuth: true });
}

export async function loginAdmin(email: string, password: string): Promise<{
  success: boolean;
  admin: { id: string; email: string; name: string };
  token: string;
}> {
  const result = await apiRequest<{
    success: boolean;
    admin: { id: string; email: string; name: string };
    token: string;
  }>('/api/admin/login', {
    method: 'POST',
    body: { email, password },
  });
  if (result.token) {
    writeStoredToken(ADMIN_TOKEN_KEY, result.token);
  }
  return result;
}

export async function logoutAdmin(): Promise<void> {
  await apiRequest('/api/admin/logout', { method: 'POST', includeAdminAuth: true });
  writeStoredToken(ADMIN_TOKEN_KEY, null);
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return apiRequest('/api/admin/overview', { includeAdminAuth: true });
}

export async function updateAdminRegistrationSetting(
  registrationsEnabled: boolean
): Promise<{ registrationsEnabled: boolean }> {
  return apiRequest('/api/admin/settings', {
    method: 'PATCH',
    body: { registrationsEnabled },
    includeAdminAuth: true,
  });
}

export async function fetchAdminRegistrations(params?: {
  q?: string;
  status?: string;
}): Promise<{ registrations: AdminRegistrationView[] }> {
  const query = new URLSearchParams();
  if (params?.q) query.set('q', params.q);
  if (params?.status) query.set('status', params.status);
  const qs = query.toString();
  return apiRequest(`/api/admin/registrations${qs ? `?${qs}` : ''}`, {
    includeAdminAuth: true,
  });
}

export async function updateRegistrationStatus(
  id: string,
  status: RegistrationStatus
): Promise<{ registration: PublicRegistration }> {
  return apiRequest(`/api/admin/registrations/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: { status },
    includeAdminAuth: true,
  });
}

export async function issueAdminDeviceRecovery(
  id: string,
  unbindCurrentDevice: boolean
): Promise<{
  success: boolean;
  recoveryKey: string;
  unbindCurrentDevice: boolean;
  registration: PublicRegistration;
}> {
  return apiRequest(`/api/admin/registrations/${encodeURIComponent(id)}/recovery`, {
    method: 'POST',
    body: { unbindCurrentDevice },
    includeAdminAuth: true,
  });
}

export async function deleteAdminRegistration(id: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/admin/registrations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    includeAdminAuth: true,
  });
}

export async function fetchAdminDownloads(): Promise<{ items: DownloadItem[] }> {
  return apiRequest('/api/admin/downloads', { includeAdminAuth: true });
}

export async function createAdminDownload(
  payload: DownloadFormPayload
): Promise<{ item: DownloadItem }> {
  return apiRequest('/api/admin/downloads', {
    method: 'POST',
    body: payload,
    includeAdminAuth: true,
  });
}

export async function updateAdminDownload(
  id: string,
  payload: DownloadFormPayload
): Promise<{ item: DownloadItem }> {
  return apiRequest(`/api/admin/downloads/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: payload,
    includeAdminAuth: true,
  });
}

export async function deleteAdminDownload(id: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/admin/downloads/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    includeAdminAuth: true,
  });
}

// ============================================================================
// SOCIAL PLATFORM API CALLS (PROFILES, FEED, LIKES/COMMENTS, STORIES, DMs)
// ============================================================================

export async function uploadSocialMedia(dataUrl: string): Promise<{
  mediaUrl: string;
  mediaType: PostMediaType;
  bytes: number;
}> {
  return apiRequest('/api/social/media', {
    method: 'POST',
    body: { dataUrl },
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function fetchProfiles(
  q?: string
): Promise<{ profiles: SocialProfile[]; me: SocialProfile | null }> {
  const qs = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  return apiRequest(`/api/social/profiles${qs}`, {
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function fetchProfileDetail(
  userId: string
): Promise<{ profile: SocialProfile; posts: FeedPost[] }> {
  return apiRequest(`/api/social/profiles/${encodeURIComponent(userId)}`, {
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function updateMyProfile(patch: {
  displayName?: string;
  username?: string;
  bio?: string;
  location?: string;
  website?: string;
  avatarUrl?: string;
}): Promise<{ profile: SocialProfile }> {
  return apiRequest('/api/social/profile', {
    method: 'PATCH',
    body: patch,
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function toggleFollowUser(userId: string): Promise<{
  ok: true;
  following: boolean;
  followersCount: number;
  followingCount: number;
}> {
  return apiRequest(`/api/social/profiles/${encodeURIComponent(userId)}/follow`, {
    method: 'POST',
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function fetchSocialFeed(params?: {
  filter?: 'all' | 'following' | 'image' | 'video';
  authorId?: string;
}): Promise<{ posts: FeedPost[] }> {
  const query = new URLSearchParams();
  if (params?.filter && params.filter !== 'all') query.set('filter', params.filter);
  if (params?.authorId) query.set('authorId', params.authorId);
  const qs = query.toString();
  return apiRequest(`/api/social/feed${qs ? `?${qs}` : ''}`, {
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function fetchSocialPostById(postId: string): Promise<{ post: FeedPost }> {
  return apiRequest(`/api/social/posts/${encodeURIComponent(postId)}`, {
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function createSocialPost(payload: {
  mediaType: PostMediaType;
  mediaUrl: string;
  posterUrl?: string;
  caption?: string;
  location?: string;
}): Promise<{ post: FeedPost }> {
  return apiRequest('/api/social/posts', {
    method: 'POST',
    body: payload,
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function deleteSocialPost(postId: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/social/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function togglePostLike(
  postId: string
): Promise<{ liked: boolean; likesCount: number }> {
  return apiRequest(`/api/social/posts/${encodeURIComponent(postId)}/like`, {
    method: 'POST',
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function addPostComment(
  postId: string,
  text: string
): Promise<{ comment: PostComment; commentsCount: number }> {
  return apiRequest(`/api/social/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    body: { text },
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function deletePostComment(
  postId: string,
  commentId: string
): Promise<{ success: boolean; commentsCount: number }> {
  return apiRequest(
    `/api/social/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: 'DELETE',
      includeUserAuth: true,
      includeDeviceHeader: true,
    }
  );
}

export async function fetchStories(): Promise<{ groups: StoryGroup[] }> {
  return apiRequest('/api/social/stories', {
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function createStory(payload: {
  mediaType: PostMediaType;
  mediaUrl: string;
  caption?: string;
}): Promise<{ story: StoryItem }> {
  return apiRequest('/api/social/stories', {
    method: 'POST',
    body: payload,
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function viewStory(storyId: string): Promise<{ viewsCount: number }> {
  return apiRequest(`/api/social/stories/${encodeURIComponent(storyId)}/view`, {
    method: 'POST',
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function deleteStory(storyId: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/social/stories/${encodeURIComponent(storyId)}`, {
    method: 'DELETE',
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function fetchConversations(): Promise<{
  conversations: ConversationSummary[];
  totalUnread: number;
}> {
  return apiRequest('/api/social/conversations', {
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function fetchConversationMessages(peerId: string): Promise<{
  conversationId: string;
  peer: SocialProfile;
  messages: DirectMessage[];
}> {
  return apiRequest(`/api/social/conversations/${encodeURIComponent(peerId)}/messages`, {
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}

export async function sendDirectMessage(
  peerId: string,
  payload: {
    text?: string;
    mediaType?: PostMediaType;
    mediaUrl?: string;
    storyRefId?: string;
  }
): Promise<{ message: DirectMessage }> {
  return apiRequest(`/api/social/conversations/${encodeURIComponent(peerId)}/messages`, {
    method: 'POST',
    body: payload,
    includeUserAuth: true,
    includeDeviceHeader: true,
  });
}
