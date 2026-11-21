import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type {
  ConversationSummary,
  DeviceCheckResponse,
  DirectMessage,
  DownloadItem,
  FeedPost,
  PublicRegistration,
  RealtimeEvent,
  SocialProfile,
  StoryGroup,
} from '../shared/types';
import {
  ApiError,
  addPostComment,
  checkDeviceRegistration,
  deletePostComment,
  deleteSocialPost,
  fetchCatalog,
  fetchConversations,
  fetchDownloadById,
  fetchProfiles,
  fetchSocialFeed,
  fetchSocialPostById,
  fetchStories,
  logoutUserSession,
  toggleFollowUser,
  togglePostLike,
} from './lib/api';
import { useSocialRealtime } from './lib/realtime';
import { AdminDashboard } from './components/AdminDashboard';
import { AppHeader } from './components/AppHeader';
import type { ActiveNavSection } from './components/AppHeader';
import { BrandLogo } from './components/BrandLogo';
import { DownloadDetailPage } from './components/DownloadDetailPage';
import { HomePage } from './components/HomePage';
import { MessagesPage } from './components/MessagesPage';
import { PreRegistrationPage } from './components/PreRegistrationPage';
import { ProfilePage } from './components/ProfilePage';
import { RegistrationPage } from './components/RegistrationPage';
import { RegistrationSuccessPage } from './components/RegistrationSuccessPage';
import { SocialFeedPage } from './components/SocialFeedPage';
import type { FeedFilterMode } from './components/SocialFeedPage';

type RouteView =
  | { name: 'register' }
  | { name: 'pre-registration' }
  | { name: 'success' }
  | { name: 'home' }
  | { name: 'downloads' }
  | { name: 'messages'; peerId?: string }
  | { name: 'profile'; userId?: string }
  | { name: 'detail'; fileId: string }
  | { name: 'admin' };

function parseLocationRoute(): RouteView {
  const pathname = window.location.pathname;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return { name: 'admin' };
  }
  if (pathname === '/pre-registration') {
    return { name: 'pre-registration' };
  }
  if (pathname === '/success') {
    return { name: 'success' };
  }
  if (pathname === '/home' || pathname === '/feed') {
    return { name: 'home' };
  }
  if (pathname === '/downloads') {
    return { name: 'downloads' };
  }
  if (pathname === '/messages') {
    return { name: 'messages' };
  }
  const msgMatch = pathname.match(/^\/messages\/([^/]+)$/);
  if (msgMatch) {
    return { name: 'messages', peerId: decodeURIComponent(msgMatch[1]) };
  }
  if (pathname === '/profile') {
    return { name: 'profile' };
  }
  const profMatch = pathname.match(/^\/profile\/([^/]+)$/);
  if (profMatch) {
    return { name: 'profile', userId: decodeURIComponent(profMatch[1]) };
  }
  const detailMatch = pathname.match(/^\/download\/([^/]+)$/);
  if (detailMatch) {
    return { name: 'detail', fileId: decodeURIComponent(detailMatch[1]) };
  }
  return { name: 'register' };
}

function routeToPath(route: RouteView): string {
  switch (route.name) {
    case 'admin':
      return '/admin';
    case 'pre-registration':
      return '/pre-registration';
    case 'success':
      return '/success';
    case 'home':
      return '/home';
    case 'downloads':
      return '/downloads';
    case 'messages':
      return route.peerId ? `/messages/${encodeURIComponent(route.peerId)}` : '/messages';
    case 'profile':
      return route.userId ? `/profile/${encodeURIComponent(route.userId)}` : '/profile';
    case 'detail':
      return `/download/${encodeURIComponent(route.fileId)}`;
    default:
      return '/';
  }
}

export default function App() {
  const [route, setRoute] = useState<RouteView>(() => parseLocationRoute());
  const [verifying, setVerifying] = useState(true);
  const [deviceStatus, setDeviceStatus] = useState<DeviceCheckResponse | null>(null);
  const [registration, setRegistration] = useState<PublicRegistration | null>(null);
  const [prefilledEmail, setPrefilledEmail] = useState<string>('');

  // Downloads catalog state
  const [catalog, setCatalog] = useState<DownloadItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [activeDetailItem, setActiveDetailItem] = useState<DownloadItem | null>(null);

  // Social platform state
  const [myProfile, setMyProfile] = useState<SocialProfile | null>(null);
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [feedFilter, setFeedFilter] = useState<FeedFilterMode>('all');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [profileRefreshSignal, setProfileRefreshSignal] = useState(0);

  // Real-time DM event hooks passed into MessagesPage
  const [realtimeIncomingMessage, setRealtimeIncomingMessage] = useState<DirectMessage | null>(null);
  const [realtimeReadReceipt, setRealtimeReadReceipt] = useState<{
    conversationId: string;
    readerId: string;
    readAt: string;
  } | null>(null);

  // Shared non-intrusive notification toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 3800);
  }, []);

  const navigate = useCallback((next: RouteView, replace = false) => {
    const nextPath = routeToPath(next);
    if (window.location.pathname !== nextPath) {
      if (replace) {
        window.history.replaceState({}, '', nextPath);
      } else {
        window.history.pushState({}, '', nextPath);
      }
    }
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);

  const handleAuthFailure = useCallback(async () => {
    setRegistration(null);
    const freshCheck = await checkDeviceRegistration().catch(() => null);
    if (freshCheck) setDeviceStatus(freshCheck);
    navigate({ name: 'register' }, true);
  }, [navigate]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await fetchCatalog();
      setCatalog(res.items);
      if (res.registration) {
        setRegistration(res.registration);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        await handleAuthFailure();
      }
    } finally {
      setCatalogLoading(false);
    }
  }, [handleAuthFailure]);

  const loadProfiles = useCallback(async () => {
    try {
      const res = await fetchProfiles();
      setProfiles(res.profiles);
      setMyProfile(res.me);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        await handleAuthFailure();
      }
    }
  }, [handleAuthFailure]);

  const loadFeed = useCallback(
    async (filter: FeedFilterMode) => {
      setPostsLoading(true);
      try {
        const res = await fetchSocialFeed({ filter });
        setPosts(res.posts);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          await handleAuthFailure();
        }
      } finally {
        setPostsLoading(false);
      }
    },
    [handleAuthFailure]
  );

  const loadStories = useCallback(async () => {
    try {
      const res = await fetchStories();
      setStories(res.groups);
    } catch {
      // Non-fatal
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetchConversations();
      setConversations(res.conversations);
      setUnreadMessages(res.totalUnread);
    } catch {
      // Non-fatal
    }
  }, []);

  const verifyDeviceAccess = useCallback(async (): Promise<PublicRegistration | null> => {
    setVerifying(true);
    try {
      const check = await checkDeviceRegistration();
      setDeviceStatus(check);
      if (check.registered && check.registration) {
        setRegistration(check.registration);
        const current = parseLocationRoute();
        if (current.name === 'register' || current.name === 'pre-registration') {
          navigate({ name: 'home' }, true);
        }
        return check.registration;
      } else {
        setRegistration(null);
        const current = parseLocationRoute();
        if (current.name !== 'admin' && current.name !== 'pre-registration') {
          navigate({ name: 'register' }, true);
        }
        return null;
      }
    } catch {
      setDeviceStatus({
        registered: false,
        status: 'UNREGISTERED',
        registrationsEnabled: true,
        deviceIdPreview: 'VERIFYING',
        deviceAlreadyRegistered: false,
        message: 'Unable to reach verification server. Please retry shortly.',
      });
      return null;
    } finally {
      setVerifying(false);
    }
  }, [navigate]);

  useEffect(() => {
    verifyDeviceAccess();
  }, [verifyDeviceAccess]);

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseLocationRoute());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Hydrate initial social + downloads state once registered
  useEffect(() => {
    if (!registration) return;
    loadProfiles();
    loadStories();
    loadConversations();
    loadCatalog();
  }, [registration, loadProfiles, loadStories, loadConversations, loadCatalog]);

  // Reload feed when filter or registration changes
  useEffect(() => {
    if (!registration) return;
    loadFeed(feedFilter);
  }, [registration, feedFilter, loadFeed]);

  // Resolve detail view item from catalog or server
  useEffect(() => {
    if (route.name !== 'detail' || !registration) {
      setActiveDetailItem(null);
      return;
    }
    const found = catalog.find((c) => c.id === route.fileId || c.slug === route.fileId);
    if (found) {
      setActiveDetailItem(found);
      return;
    }
    let active = true;
    fetchDownloadById(route.fileId)
      .then((res) => {
        if (active) setActiveDetailItem(res.item);
      })
      .catch(() => {
        if (active) navigate({ name: 'downloads' }, true);
      });
    return () => {
      active = false;
    };
  }, [route, registration, catalog, navigate]);

  // Live WebSocket event dispatcher for real-time social updates
  const handleRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      if (!registration) return;

      switch (event.type) {
        case 'presence:update': {
          const onlineSet = new Set(event.onlineUserIds);
          setProfiles((prev) =>
            prev.map((p) => ({ ...p, isOnline: onlineSet.has(p.userId) }))
          );
          setMyProfile((prev) =>
            prev ? { ...prev, isOnline: onlineSet.has(prev.userId) } : prev
          );
          setConversations((prev) =>
            prev.map((c) => ({
              ...c,
              peer: { ...c.peer, isOnline: onlineSet.has(c.peer.userId) },
            }))
          );
          break;
        }
        case 'post:created': {
          fetchSocialPostById(event.postId)
            .then((res) => {
              setPosts((prev) =>
                prev.some((p) => p.id === res.post.id) ? prev : [res.post, ...prev]
              );
              loadProfiles();
              setProfileRefreshSignal((n) => n + 1);
            })
            .catch(() => {});
          break;
        }
        case 'post:deleted': {
          setPosts((prev) => prev.filter((p) => p.id !== event.postId));
          loadProfiles();
          setProfileRefreshSignal((n) => n + 1);
          break;
        }
        case 'post:liked': {
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== event.postId) return p;
              return {
                ...p,
                likesCount: event.likesCount,
                likedByMe: event.userId === registration.id ? event.liked : p.likedByMe,
              };
            })
          );
          break;
        }
        case 'post:commented': {
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== event.postId) return p;
              if (p.comments.some((c) => c.id === event.comment.id)) {
                return { ...p, commentsCount: event.commentsCount };
              }
              return {
                ...p,
                commentsCount: event.commentsCount,
                comments: [
                  ...p.comments,
                  {
                    ...event.comment,
                    canDelete:
                      event.comment.authorId === registration.id ||
                      p.authorId === registration.id,
                  },
                ],
              };
            })
          );
          break;
        }
        case 'post:comment_deleted': {
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== event.postId) return p;
              return {
                ...p,
                commentsCount: event.commentsCount,
                comments: p.comments.filter((c) => c.id !== event.commentId),
              };
            })
          );
          break;
        }
        case 'story:created':
        case 'story:deleted': {
          loadStories();
          break;
        }
        case 'dm:message': {
          setRealtimeIncomingMessage(event.message);
          loadConversations();
          break;
        }
        case 'dm:read': {
          setRealtimeReadReceipt({
            conversationId: event.conversationId,
            readerId: event.readerId,
            readAt: event.readAt,
          });
          loadConversations();
          break;
        }
        case 'profile:updated':
        case 'profile:followed': {
          loadProfiles();
          setProfileRefreshSignal((n) => n + 1);
          break;
        }
      }
    },
    [registration, loadProfiles, loadStories, loadConversations]
  );

  useSocialRealtime(Boolean(registration), handleRealtimeEvent);

  // Social mutation handlers with optimistic UI + authoritative server sync
  const handlePostCreated = useCallback(
    (created: FeedPost) => {
      setPosts((prev) => (prev.some((p) => p.id === created.id) ? prev : [created, ...prev]));
      loadProfiles();
    },
    [loadProfiles]
  );

  const handleToggleLike = useCallback(
    async (postId: string) => {
      // Optimistic flip
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                likedByMe: !p.likedByMe,
                likesCount: p.likedByMe ? Math.max(0, p.likesCount - 1) : p.likesCount + 1,
              }
            : p
        )
      );
      try {
        const res = await togglePostLike(postId);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, likedByMe: res.liked, likesCount: res.likesCount } : p
          )
        );
      } catch (err) {
        loadFeed(feedFilter);
        showToast('error', err instanceof Error ? err.message : 'Unable to update like.');
      }
    },
    [feedFilter, loadFeed, showToast]
  );

  const handleAddComment = useCallback(async (postId: string, text: string) => {
    const res = await addPostComment(postId, text);
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const already = p.comments.some((c) => c.id === res.comment.id);
        return {
          ...p,
          commentsCount: res.commentsCount,
          comments: already ? p.comments : [...p.comments, res.comment],
        };
      })
    );
  }, []);

  const handleDeleteComment = useCallback(
    async (postId: string, commentId: string) => {
      try {
        const res = await deletePostComment(postId, commentId);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  commentsCount: res.commentsCount,
                  comments: p.comments.filter((c) => c.id !== commentId),
                }
              : p
          )
        );
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Unable to delete comment.');
      }
    },
    [showToast]
  );

  const handleDeletePost = useCallback(
    async (postId: string) => {
      try {
        await deleteSocialPost(postId);
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        loadProfiles();
        showToast('success', 'Post removed.');
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Unable to delete post.');
      }
    },
    [loadProfiles, showToast]
  );

  const handleToggleFollow = useCallback(
    async (targetUserId: string) => {
      try {
        const res = await toggleFollowUser(targetUserId);
        setProfiles((prev) =>
          prev.map((p) =>
            p.userId === targetUserId
              ? { ...p, isFollowing: res.following, followersCount: res.followersCount }
              : p.isSelf
                ? { ...p, followingCount: res.followingCount }
                : p
          )
        );
        setMyProfile((prev) => (prev ? { ...prev, followingCount: res.followingCount } : prev));
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Unable to update follow state.');
      }
    },
    [showToast]
  );

  function handleDownloadCountUpdated(fileId: string, newCount: number) {
    setCatalog((prev) =>
      prev.map((item) => (item.id === fileId ? { ...item, downloadsCount: newCount } : item))
    );
    setActiveDetailItem((prev) =>
      prev && prev.id === fileId ? { ...prev, downloadsCount: newCount } : prev
    );
  }

  async function handleUserLogout() {
    await logoutUserSession();
    setRegistration(null);
    setCatalog([]);
    setPosts([]);
    setStories([]);
    setProfiles([]);
    setMyProfile(null);
    setConversations([]);
    setUnreadMessages(0);
    await verifyDeviceAccess();
    navigate({ name: 'register' }, true);
  }

  // Admin portal is always independently accessible via /admin with its own auth gate
  if (route.name === 'admin') {
    return (
      <AdminDashboard
        onExitAdmin={async () => {
          const verified = await verifyDeviceAccess();
          if (verified) {
            navigate({ name: 'home' });
          } else {
            navigate({ name: 'register' });
          }
        }}
        onCatalogMutated={() => {
          if (registration) {
            loadCatalog();
          }
        }}
      />
    );
  }

  // Initial server-side device verification gate loader
  if (verifying || !deviceStatus) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0B0810] px-6 text-slate-300">
        <BrandLogo size="lg" />
        <p className="text-xs font-medium text-slate-400">
          Verifying device registration status...
        </p>
      </div>
    );
  }

  // Strictly enforce mandatory one-time registration before any social or download routes
  if (!registration) {
    if (route.name === 'pre-registration') {
      return (
        <PreRegistrationPage
          deviceStatus={deviceStatus}
          onPreRegistered={(preReg) => {
            if (preReg.email) setPrefilledEmail(preReg.email);
            setDeviceStatus({
              registered: false,
              status: 'PRE_REGISTERED',
              registrationsEnabled: deviceStatus.registrationsEnabled,
              deviceIdPreview: preReg.deviceShortId,
              deviceAlreadyRegistered: false,
              maskedEmail: preReg.email || undefined,
              message:
                'Pre-Registration completed. Paste your copied code below to unlock MAXAGRAM, or pre-register again anytime.',
            });
          }}
          onProceedToUnlock={(emailToFill) => {
            if (emailToFill) setPrefilledEmail(emailToFill);
            navigate({ name: 'register' });
          }}
          onBack={() => navigate({ name: 'register' })}
          onOpenAdmin={() => navigate({ name: 'admin' })}
        />
      );
    }

    return (
      <RegistrationPage
        deviceStatus={deviceStatus}
        prefilledEmail={prefilledEmail}
        onRegistered={(created) => {
          setRegistration(created);
          setDeviceStatus({
            registered: true,
            status: 'ACTIVE',
            registrationsEnabled: deviceStatus.registrationsEnabled,
            deviceIdPreview: created.deviceShortId,
            deviceAlreadyRegistered: true,
            registration: created,
          });
          navigate({ name: 'success' });
        }}
        onRecovered={(restored) => {
          setRegistration(restored);
          setDeviceStatus({
            registered: true,
            status: 'ACTIVE',
            registrationsEnabled: deviceStatus.registrationsEnabled,
            deviceIdPreview: restored.deviceShortId,
            deviceAlreadyRegistered: true,
            registration: restored,
          });
          navigate({ name: 'home' });
        }}
        onOpenPreRegistration={() => navigate({ name: 'pre-registration' })}
        onOpenAdmin={() => navigate({ name: 'admin' })}
      />
    );
  }

  // Dedicated Registration Success Screen right after completing registration
  if (route.name === 'success') {
    return (
      <RegistrationSuccessPage
        registration={registration}
        onContinue={() => {
          navigate({ name: 'home' });
        }}
      />
    );
  }

  // Dedicated File Details & Verified Download Screen
  if (route.name === 'detail' && activeDetailItem) {
    return (
      <DownloadDetailPage
        item={activeDetailItem}
        registration={registration}
        onBack={() => navigate({ name: 'downloads' })}
        onOpenAdmin={() => navigate({ name: 'admin' })}
        onDownloadCountUpdated={handleDownloadCountUpdated}
        onAuthExpired={() => verifyDeviceAccess()}
      />
    );
  }

  const activeNavSection: ActiveNavSection =
    route.name === 'messages'
      ? 'messages'
      : route.name === 'profile'
        ? 'profiles'
        : route.name === 'downloads'
          ? 'downloads'
          : 'feed';

  return (
    <div
      className="min-h-screen bg-[#0B0810] text-slate-100 flex flex-col"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 75% 32% at 50% -8%, rgba(217, 70, 239, 0.12), transparent 65%)',
      }}
    >
      <AppHeader
        activeSection={activeNavSection}
        registration={registration}
        myProfile={myProfile}
        unreadMessages={unreadMessages}
        onNavigateFeed={() => navigate({ name: 'home' })}
        onNavigateMessages={() => navigate({ name: 'messages' })}
        onNavigateProfiles={() => navigate({ name: 'profile', userId: registration.id })}
        onNavigateDownloads={() => navigate({ name: 'downloads' })}
        onOpenAdmin={() => navigate({ name: 'admin' })}
        onLogout={handleUserLogout}
      />

      {route.name === 'messages' ? (
        <MessagesPage
          currentUserId={registration.id}
          selectedPeerId={route.peerId || null}
          conversations={conversations}
          profiles={profiles}
          realtimeIncomingMessage={realtimeIncomingMessage}
          realtimeReadReceipt={realtimeReadReceipt}
          onSelectPeer={(peerId) =>
            navigate(peerId ? { name: 'messages', peerId } : { name: 'messages' })
          }
          onConversationsChanged={loadConversations}
          onOpenProfile={(userId) => navigate({ name: 'profile', userId })}
          onNotify={showToast}
        />
      ) : route.name === 'profile' ? (
        <ProfilePage
          targetUserId={route.userId || registration.id}
          currentUserId={registration.id}
          profiles={profiles}
          onProfileUpdated={(updated) => {
            setMyProfile(updated);
            setProfiles((prev) =>
              prev.map((p) => (p.userId === updated.userId ? updated : p))
            );
            loadFeed(feedFilter);
            loadStories();
          }}
          onToggleFollow={handleToggleFollow}
          onToggleLike={handleToggleLike}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
          onDeletePost={handleDeletePost}
          onOpenProfile={(userId) => navigate({ name: 'profile', userId })}
          onOpenMessages={(peerId) => navigate({ name: 'messages', peerId })}
          onNotify={showToast}
          refreshSignal={profileRefreshSignal}
        />
      ) : route.name === 'downloads' ? (
        <HomePage
          items={catalog}
          registration={registration}
          loading={catalogLoading}
          onSelectFile={(item) => {
            setActiveDetailItem(item);
            navigate({ name: 'detail', fileId: item.id });
          }}
          onDownloadCountUpdated={handleDownloadCountUpdated}
          onNotify={showToast}
          onAuthExpired={() => verifyDeviceAccess()}
        />
      ) : (
        <SocialFeedPage
          posts={posts}
          postsLoading={postsLoading}
          filter={feedFilter}
          onChangeFilter={setFeedFilter}
          stories={stories}
          profiles={profiles}
          myProfile={myProfile}
          currentUserId={registration.id}
          totalDownloadCount={catalog.length}
          onPostCreated={handlePostCreated}
          onToggleLike={handleToggleLike}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
          onDeletePost={handleDeletePost}
          onToggleFollow={handleToggleFollow}
          onRefreshStories={loadStories}
          onOpenProfile={(userId) => navigate({ name: 'profile', userId })}
          onOpenMessages={(peerId) =>
            navigate(peerId ? { name: 'messages', peerId } : { name: 'messages' })
          }
          onOpenDownloads={() => navigate({ name: 'downloads' })}
          onNotify={showToast}
        />
      )}

      {/* Quiet Editorial Footer (hidden on full-height chat view on desktop) */}
      {route.name !== 'messages' ? (
        <footer className="mt-10 border-t border-fuchsia-200/[0.08] bg-[#0B0810]">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 sm:px-6 py-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <BrandLogo size="sm" />
              <span className="text-xs text-slate-500">
                © {new Date().getFullYear()} MAXAGRAM Platform
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400">
              <span className="font-mono text-slate-500">Device: {registration.deviceShortId}</span>
              <button
                type="button"
                onClick={() => navigate({ name: 'downloads' })}
                className="hover:text-fuchsia-300 transition-colors cursor-pointer"
              >
                Verified Downloads
              </button>
              <button
                type="button"
                onClick={() => navigate({ name: 'admin' })}
                className="hover:text-fuchsia-300 transition-colors cursor-pointer"
              >
                Admin Dashboard
              </button>
            </div>
          </div>
        </footer>
      ) : null}

      {/* Non-intrusive Status Toast */}
      {toast ? (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-2.5 rounded-lg border px-4 py-3 text-xs font-medium shadow-lg ${
            toast.type === 'success'
              ? 'border-emerald-500/30 bg-[#101820] text-emerald-200'
              : 'border-red-500/30 bg-[#1C1216] text-red-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          )}
          <span>{toast.text}</span>
        </div>
      ) : null}
    </div>
  );
}
