import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Edit3,
  Film,
  Globe,
  Grid,
  Heart,
  MapPin,
  MessageCircle,
  Search,
  Send,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { FeedPost, SocialProfile } from '../../shared/types';
import { fetchProfileDetail, updateMyProfile } from '../lib/api';
import { prepareAndUploadMediaFile } from '../lib/media';
import { Avatar } from './Avatar';
import { PostCard } from './PostCard';

interface ProfilePageProps {
  targetUserId: string;
  currentUserId: string;
  profiles: SocialProfile[];
  onProfileUpdated: (profile: SocialProfile) => void;
  onToggleFollow: (userId: string) => Promise<void>;
  onToggleLike: (postId: string) => Promise<void>;
  onAddComment: (postId: string, text: string) => Promise<void>;
  onDeleteComment: (postId: string, commentId: string) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  onOpenProfile: (userId: string) => void;
  onOpenMessages: (peerId: string) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
  refreshSignal: number;
}

export function ProfilePage({
  targetUserId,
  currentUserId,
  profiles,
  onProfileUpdated,
  onToggleFollow,
  onToggleLike,
  onAddComment,
  onDeleteComment,
  onDeletePost,
  onOpenProfile,
  onOpenMessages,
  onNotify,
  refreshSignal,
}: ProfilePageProps) {
  const [viewMode, setViewMode] = useState<'profile' | 'directory'>('profile');
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  // Directory search
  const [dirSearch, setDirSearch] = useState('');

  // Edit profile modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editError, setEditError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setViewMode('profile');
  }, [targetUserId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProfileDetail(targetUserId)
      .then((res) => {
        if (cancelled) return;
        setProfile(res.profile);
        setPosts(res.posts);
      })
      .catch((err) => {
        if (cancelled) return;
        onNotify('error', err instanceof Error ? err.message : 'Unable to load profile.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetUserId, refreshSignal, onNotify]);

  // Keep online indicator in sync with global profiles state
  const liveProfile = useMemo(() => {
    if (!profile) return null;
    const match = profiles.find((p) => p.userId === profile.userId);
    return match ? { ...profile, isOnline: match.isOnline } : profile;
  }, [profile, profiles]);

  const activeLightboxPost = useMemo(
    () => (selectedPostId ? posts.find((p) => p.id === selectedPostId) || null : null),
    [posts, selectedPostId]
  );

  const filteredDirectory = useMemo(() => {
    const q = dirSearch.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q) ||
        p.bio.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q)
    );
  }, [profiles, dirSearch]);

  function openEditModal() {
    if (!liveProfile) return;
    setEditDisplayName(liveProfile.displayName);
    setEditUsername(liveProfile.username);
    setEditBio(liveProfile.bio);
    setEditLocation(liveProfile.location);
    setEditWebsite(liveProfile.website);
    setEditAvatarUrl(liveProfile.avatarUrl);
    setEditError('');
    setEditOpen(true);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditError('');
    setUploadingAvatar(true);
    try {
      const uploaded = await prepareAndUploadMediaFile(file, {
        maxDimension: 512,
        allowVideo: false,
      });
      setEditAvatarUrl(uploaded.mediaUrl);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not upload avatar image.');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setEditError('');
    try {
      const res = await updateMyProfile({
        displayName: editDisplayName,
        username: editUsername,
        bio: editBio,
        location: editLocation,
        website: editWebsite,
        avatarUrl: editAvatarUrl,
      });
      setProfile(res.profile);
      onProfileUpdated(res.profile);
      setEditOpen(false);
      onNotify('success', 'Profile updated.');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleFollowToggle() {
    if (!liveProfile || liveProfile.isSelf || followBusy) return;
    setFollowBusy(true);
    try {
      await onToggleFollow(liveProfile.userId);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: !prev.isFollowing,
              followersCount: prev.isFollowing
                ? Math.max(0, prev.followersCount - 1)
                : prev.followersCount + 1,
            }
          : prev
      );
    } finally {
      setFollowBusy(false);
    }
  }

  async function handleLightboxLike(postId: string) {
    await onToggleLike(postId);
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
  }

  async function handleLightboxAddComment(postId: string, text: string) {
    await onAddComment(postId, text);
    const refreshed = await fetchProfileDetail(targetUserId).catch(() => null);
    if (refreshed) {
      setProfile(refreshed.profile);
      setPosts(refreshed.posts);
    }
  }

  async function handleLightboxDeleteComment(postId: string, commentId: string) {
    await onDeleteComment(postId, commentId);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              comments: p.comments.filter((c) => c.id !== commentId),
              commentsCount: Math.max(0, p.commentsCount - 1),
            }
          : p
      )
    );
  }

  async function handleLightboxDeletePost(postId: string) {
    await onDeletePost(postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setSelectedPostId(null);
    setProfile((prev) =>
      prev ? { ...prev, postsCount: Math.max(0, prev.postsCount - 1) } : prev
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 sm:px-6 py-7 space-y-6">
      {/* Top Switcher: Active Profile vs Member Directory */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('profile')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'profile'
                ? 'bg-fuchsia-600 text-white'
                : 'border border-fuchsia-200/[0.09] bg-[#130F1B] text-slate-300 hover:text-white'
            }`}
          >
            <Grid className="h-3.5 w-3.5" />
            <span>{liveProfile?.isSelf ? 'My Profile' : liveProfile?.displayName || 'Profile'}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('directory')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'directory'
                ? 'bg-fuchsia-600 text-white'
                : 'border border-fuchsia-200/[0.09] bg-[#130F1B] text-slate-300 hover:text-white'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>All Members ({profiles.length})</span>
          </button>
        </div>

        {liveProfile && !liveProfile.isSelf ? (
          <button
            type="button"
            onClick={() => onOpenProfile(currentUserId)}
            className="text-xs font-medium text-fuchsia-400 hover:text-fuchsia-300 cursor-pointer"
          >
            Return to My Profile
          </button>
        ) : null}
      </div>

      {viewMode === 'directory' ? (
        /* Searchable Registered Members Directory */
        <section className="space-y-5">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={dirSearch}
              onChange={(e) => setDirSearch(e.target.value)}
              placeholder="Search members by name, @username, or city..."
              className="w-full rounded-lg border border-fuchsia-200/[0.12] bg-[#130F1B] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDirectory.map((member) => (
              <article
                key={member.userId}
                className="flex flex-col justify-between rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] p-5 hover:border-fuchsia-400/25 transition-colors"
              >
                <div>
                  <button
                    type="button"
                    onClick={() => onOpenProfile(member.userId)}
                    className="flex items-center gap-3 text-left group cursor-pointer w-full"
                  >
                    <Avatar
                      src={member.avatarUrl}
                      name={member.displayName}
                      size="md"
                      isOnline={member.isOnline}
                    />
                    <div className="min-w-0">
                      <p className="font-display text-sm font-semibold text-white group-hover:text-fuchsia-300 truncate">
                        {member.displayName}
                      </p>
                      <p className="font-mono text-xs text-fuchsia-400 truncate">
                        @{member.username}
                      </p>
                    </div>
                  </button>

                  {member.bio ? (
                    <p className="mt-3 text-xs leading-relaxed text-slate-300 line-clamp-2">
                      {member.bio}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">MAXAGRAM registered member</p>
                  )}
                </div>

                <div className="mt-4 pt-3.5 border-t border-fuchsia-200/[0.07] flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    {member.postsCount} posts · {member.followersCount} followers
                  </span>

                  <div className="flex items-center gap-1.5">
                    {!member.isSelf ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenMessages(member.userId)}
                          aria-label={`Message ${member.displayName}`}
                          className="rounded-lg border border-fuchsia-200/[0.12] p-1.5 text-slate-300 hover:bg-white/[0.06] hover:text-white cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleFollow(member.userId)}
                          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                            member.isFollowing
                              ? 'border border-fuchsia-200/[0.14] bg-[#1A1328] text-slate-200'
                              : 'bg-fuchsia-600 text-white hover:bg-fuchsia-500'
                          }`}
                        >
                          {member.isFollowing ? 'Following' : 'Follow'}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenProfile(member.userId)}
                        className="rounded-lg border border-fuchsia-200/[0.14] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:text-white cursor-pointer"
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : loading || !liveProfile ? (
        <div className="h-64 animate-pulse rounded-xl border border-fuchsia-200/[0.08] bg-[#130F1B]" />
      ) : (
        /* Individual Profile View + 3-Column Photo/Video Grid */
        <>
          <section className="rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <Avatar
                src={liveProfile.avatarUrl}
                name={liveProfile.displayName}
                size="xl"
                isOnline={liveProfile.isOnline}
              />

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
                      {liveProfile.displayName}
                    </h1>
                    <p className="mt-0.5 font-mono text-sm text-fuchsia-400">
                      @{liveProfile.username}
                      {liveProfile.isOnline ? (
                        <span className="ml-2 font-sans text-xs text-emerald-400">· Online</span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {liveProfile.isSelf ? (
                      <button
                        type="button"
                        onClick={openEditModal}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-300/[0.2] bg-[#1C142B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#261A3B] transition-colors cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-fuchsia-400" />
                        <span>Edit Profile</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={followBusy}
                          onClick={handleFollowToggle}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                            liveProfile.isFollowing
                              ? 'border border-fuchsia-200/[0.16] bg-[#1C142B] text-slate-100 hover:bg-[#261A3B]'
                              : 'bg-fuchsia-600 text-white hover:bg-fuchsia-500'
                          }`}
                        >
                          {liveProfile.isFollowing ? (
                            <>
                              <UserCheck className="h-3.5 w-3.5" />
                              <span>Following</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-3.5 w-3.5" />
                              <span>Follow</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenMessages(liveProfile.userId)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200/[0.16] bg-[#1C142B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#261A3B] transition-colors cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5 text-fuchsia-400" />
                          <span>Message</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {liveProfile.bio ? (
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-200">
                    {liveProfile.bio}
                  </p>
                ) : liveProfile.isSelf ? (
                  <p className="mt-4 text-xs text-slate-500">
                    Add a bio, location, and profile photo via Edit Profile.
                  </p>
                ) : null}

                {(liveProfile.location || liveProfile.website) ? (
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                    {liveProfile.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-fuchsia-400" />
                        <span>{liveProfile.location}</span>
                      </span>
                    ) : null}
                    {liveProfile.website ? (
                      <span className="inline-flex items-center gap-1 font-mono text-fuchsia-300">
                        <Globe className="h-3.5 w-3.5" />
                        <span>{liveProfile.website}</span>
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {/* Tabular Profile Metrics */}
                <div className="mt-6 flex items-center gap-8 border-t border-fuchsia-200/[0.08] pt-5">
                  <div>
                    <span className="font-mono text-lg font-semibold text-white tabular-nums">
                      {liveProfile.postsCount}
                    </span>
                    <span className="ml-1.5 text-xs text-slate-400">Posts</span>
                  </div>
                  <div>
                    <span className="font-mono text-lg font-semibold text-white tabular-nums">
                      {liveProfile.followersCount}
                    </span>
                    <span className="ml-1.5 text-xs text-slate-400">Followers</span>
                  </div>
                  <div>
                    <span className="font-mono text-lg font-semibold text-white tabular-nums">
                      {liveProfile.followingCount}
                    </span>
                    <span className="ml-1.5 text-xs text-slate-400">Following</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 3-Column Photo & Video Post Grid */}
          <section className="space-y-4">
            <h2 className="font-display text-base font-semibold text-white">
              Shared Photos & Videos
            </h2>

            {posts.length === 0 ? (
              <div className="rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] px-6 py-14 text-center">
                <p className="font-display text-base font-semibold text-white">
                  No shared posts yet
                </p>
                <p className="mt-1.5 text-xs text-slate-400">
                  {liveProfile.isSelf
                    ? 'Photos and videos you share on the Feed will appear in your profile gallery.'
                    : `${liveProfile.displayName} hasn’t posted photos or videos yet.`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4">
                {posts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => setSelectedPostId(post.id)}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-fuchsia-200/[0.09] bg-[#0B0810] cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                  >
                    {post.mediaType === 'video' ? (
                      <>
                        {post.posterUrl ? (
                          <img
                            src={post.posterUrl}
                            alt={post.caption || 'Video post'}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <video
                            src={post.mediaUrl}
                            muted
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-cover"
                          />
                        )}
                        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-mono text-white">
                          <Film className="h-3 w-3 text-fuchsia-400" />
                          <span>Video</span>
                        </span>
                      </>
                    ) : (
                      <img
                        src={post.mediaUrl}
                        alt={post.caption || 'Photo post'}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}

                    {/* Hover Engagement Scrim */}
                    <div className="absolute inset-0 flex items-center justify-center gap-5 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white tabular-nums">
                        <Heart className="h-4 w-4 fill-fuchsia-400 text-fuchsia-400" />
                        {post.likesCount}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white tabular-nums">
                        <MessageCircle className="h-4 w-4" />
                        {post.commentsCount}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Post Detail Lightbox Modal */}
      {activeLightboxPost ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setSelectedPostId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl"
          >
            <button
              type="button"
              onClick={() => setSelectedPostId(null)}
              aria-label="Close post"
              className="absolute right-3 top-3 z-10 rounded-lg bg-black/70 p-1.5 text-white hover:bg-black cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <PostCard
              post={activeLightboxPost}
              defaultCommentsOpen
              onToggleLike={handleLightboxLike}
              onAddComment={handleLightboxAddComment}
              onDeleteComment={handleLightboxDeleteComment}
              onDeletePost={handleLightboxDeletePost}
              onOpenProfile={(uid) => {
                setSelectedPostId(null);
                onOpenProfile(uid);
              }}
              onMessageUser={(uid) => {
                setSelectedPostId(null);
                onOpenMessages(uid);
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Edit Own Profile Modal */}
      {editOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={() => setEditOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-fuchsia-200/[0.14] bg-[#130F1B] p-6 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-fuchsia-200/[0.08] pb-4">
              <h2 className="font-display text-lg font-semibold text-white">Edit Profile</h2>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                aria-label="Close edit modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarUpload}
                className="hidden"
              />

              <div className="flex items-center gap-4">
                <Avatar src={editAvatarUrl} name={editDisplayName || 'Me'} size="lg" />
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={uploadingAvatar}
                    onClick={() => avatarInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200/[0.15] bg-[#1A1328] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#241A36] cursor-pointer disabled:opacity-50"
                  >
                    <Camera className="h-3.5 w-3.5 text-fuchsia-400" />
                    <span>{uploadingAvatar ? 'Uploading...' : 'Change Photo'}</span>
                  </button>
                  {editAvatarUrl ? (
                    <button
                      type="button"
                      onClick={() => setEditAvatarUrl('')}
                      className="block text-[11px] text-slate-400 hover:text-rose-300 cursor-pointer"
                    >
                      Remove photo
                    </button>
                  ) : null}
                </div>
              </div>

              <div>
                <label htmlFor="edit-name" className="block text-xs font-medium text-slate-300 mb-1">
                  Display Name
                </label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-fuchsia-200/[0.12] bg-[#0B0810] px-3.5 py-2 text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="edit-username" className="block text-xs font-medium text-slate-300 mb-1">
                  Username
                </label>
                <div className="relative flex items-center">
                  <span className="pointer-events-none absolute left-3.5 font-mono text-sm text-slate-500">
                    @
                  </span>
                  <input
                    id="edit-username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={24}
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value.toLowerCase())}
                    className="w-full rounded-lg border border-fuchsia-200/[0.12] bg-[#0B0810] py-2 pl-8 pr-3.5 font-mono text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="edit-bio" className="text-xs font-medium text-slate-300">
                    Bio
                  </label>
                  <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                    {editBio.length}/280
                  </span>
                </div>
                <textarea
                  id="edit-bio"
                  rows={3}
                  maxLength={280}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Tell MAXAGRAM members about yourself..."
                  className="w-full rounded-lg border border-fuchsia-200/[0.12] bg-[#0B0810] px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-location" className="block text-xs font-medium text-slate-300 mb-1">
                    Location
                  </label>
                  <input
                    id="edit-location"
                    type="text"
                    maxLength={80}
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="Mumbai, IN"
                    className="w-full rounded-lg border border-fuchsia-200/[0.12] bg-[#0B0810] px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="edit-website" className="block text-xs font-medium text-slate-300 mb-1">
                    Website
                  </label>
                  <input
                    id="edit-website"
                    type="text"
                    maxLength={120}
                    value={editWebsite}
                    onChange={(e) => setEditWebsite(e.target.value)}
                    placeholder="portfolio.io"
                    className="w-full rounded-lg border border-fuchsia-200/[0.12] bg-[#0B0810] px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
                  />
                </div>
              </div>

              {editError ? <p className="text-xs text-rose-400">{editError}</p> : null}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-lg border border-fuchsia-200/[0.12] px-4 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile || uploadingAvatar}
                  className="rounded-lg bg-fuchsia-600 px-5 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {savingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
