import { useRef, useState } from 'react';
import {
  ArrowUpRight,
  Download,
  Film,
  ImagePlus,
  MapPin,
  MessageSquare,
  Plus,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  FeedPost,
  PostMediaType,
  SocialProfile,
  StoryGroup,
} from '../../shared/types';
import { createSocialPost } from '../lib/api';
import { prepareAndUploadMediaFile } from '../lib/media';
import { Avatar } from './Avatar';
import { PostCard } from './PostCard';
import { StoriesBar } from './StoriesBar';

export type FeedFilterMode = 'all' | 'following' | 'image' | 'video';

interface SocialFeedPageProps {
  posts: FeedPost[];
  postsLoading: boolean;
  filter: FeedFilterMode;
  onChangeFilter: (next: FeedFilterMode) => void;
  stories: StoryGroup[];
  profiles: SocialProfile[];
  myProfile: SocialProfile | null;
  currentUserId: string;
  totalDownloadCount: number;
  onPostCreated: (post: FeedPost) => void;
  onToggleLike: (postId: string) => void;
  onAddComment: (postId: string, text: string) => Promise<void>;
  onDeleteComment: (postId: string, commentId: string) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  onToggleFollow: (userId: string) => Promise<void>;
  onRefreshStories: () => void;
  onOpenProfile: (userId: string) => void;
  onOpenMessages: (peerId?: string) => void;
  onOpenDownloads: () => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

export function SocialFeedPage({
  posts,
  postsLoading,
  filter,
  onChangeFilter,
  stories,
  profiles,
  myProfile,
  currentUserId,
  totalDownloadCount,
  onPostCreated,
  onToggleLike,
  onAddComment,
  onDeleteComment,
  onDeletePost,
  onToggleFollow,
  onRefreshStories,
  onOpenProfile,
  onOpenMessages,
  onOpenDownloads,
  onNotify,
}: SocialFeedPageProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<PostMediaType>('image');
  const [posterUrl, setPosterUrl] = useState<string | undefined>(undefined);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [formError, setFormError] = useState('');
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const suggestedMembers = profiles.filter((p) => !p.isSelf).slice(0, 6);

  function resetComposer() {
    setMediaUrl('');
    setMediaType('image');
    setPosterUrl(undefined);
    setCaption('');
    setLocation('');
    setFormError('');
    setUploading(false);
    setPublishing(false);
  }

  async function handleSelectMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError('');
    setUploading(true);
    try {
      const uploaded = await prepareAndUploadMediaFile(file, {
        maxDimension: 1400,
        allowVideo: true,
      });
      setMediaUrl(uploaded.mediaUrl);
      setMediaType(uploaded.mediaType);
      setPosterUrl(uploaded.posterUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to upload selected file.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handlePublishPost(e: React.FormEvent) {
    e.preventDefault();
    if (!mediaUrl) {
      setFormError('Upload a photo or video before sharing to the feed.');
      return;
    }
    setPublishing(true);
    setFormError('');
    try {
      const res = await createSocialPost({
        mediaType,
        mediaUrl,
        posterUrl,
        caption,
        location,
      });
      onPostCreated(res.post);
      setComposerOpen(false);
      resetComposer();
      onNotify('success', 'Your post is live on MAXAGRAM.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to publish post.');
    } finally {
      setPublishing(false);
    }
  }

  async function handleSidebarFollow(userId: string) {
    if (followBusyId) return;
    setFollowBusyId(userId);
    try {
      await onToggleFollow(userId);
    } finally {
      setFollowBusyId(null);
    }
  }

  const filters: Array<{ id: FeedFilterMode; label: string }> = [
    { id: 'all', label: 'All Posts' },
    { id: 'following', label: 'Following' },
    { id: 'image', label: 'Photos' },
    { id: 'video', label: 'Videos' },
  ];

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 sm:px-6 py-6 lg:py-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Main Social Column (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* 24-Hour Stories Rail */}
          <StoriesBar
            groups={stories}
            myProfile={myProfile}
            currentUserId={currentUserId}
            onRefreshStories={onRefreshStories}
            onOpenProfile={onOpenProfile}
            onNotify={onNotify}
          />

          {/* Feed Filter Bar + Share Post Primary Action */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {filters.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onChangeFilter(tab.id)}
                  className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    filter === tab.id
                      ? 'bg-fuchsia-600 text-white'
                      : 'border border-fuchsia-200/[0.09] bg-[#130F1B] text-slate-300 hover:bg-[#1D152B] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                resetComposer();
                setComposerOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Share Photo / Video</span>
            </button>
          </div>

          {/* Posts Feed */}
          {postsLoading ? (
            <div className="space-y-5">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="h-[440px] animate-pulse rounded-xl border border-fuchsia-200/[0.07] bg-[#130F1B]"
                />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] px-6 py-14 text-center">
              <p className="font-display text-lg font-semibold text-white">
                {filter === 'following'
                  ? 'No posts from followed members yet'
                  : filter === 'video'
                    ? 'No videos shared yet'
                    : 'No posts to show right now'}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {filter === 'following'
                  ? 'Follow creators in the sidebar or share your first photo or video.'
                  : 'Be the first to share a photo or video clip with the MAXAGRAM community.'}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                {filter !== 'all' ? (
                  <button
                    type="button"
                    onClick={() => onChangeFilter('all')}
                    className="rounded-lg border border-fuchsia-200/[0.14] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-[#1D152B] cursor-pointer"
                  >
                    Show All Posts
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    resetComposer();
                    setComposerOpen(true);
                  }}
                  className="rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 cursor-pointer"
                >
                  Share Photo / Video
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onToggleLike={onToggleLike}
                  onAddComment={onAddComment}
                  onDeleteComment={onDeleteComment}
                  onDeletePost={onDeletePost}
                  onOpenProfile={onOpenProfile}
                  onMessageUser={(uid) => onOpenMessages(uid)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Editorial Sidebar (4 cols) */}
        <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-[84px]">
          {/* Your Profile Card */}
          {myProfile ? (
            <section className="rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] p-5">
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => onOpenProfile(myProfile.userId)}
                  className="cursor-pointer"
                >
                  <Avatar
                    src={myProfile.avatarUrl}
                    name={myProfile.displayName}
                    size="lg"
                    isOnline={myProfile.isOnline}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(myProfile.userId)}
                    className="block font-display text-base font-semibold text-white hover:text-fuchsia-300 transition-colors truncate cursor-pointer text-left"
                  >
                    {myProfile.displayName}
                  </button>
                  <p className="font-mono text-xs text-fuchsia-400 truncate">
                    @{myProfile.username}
                  </p>
                </div>
              </div>

              {myProfile.bio ? (
                <p className="mt-3 text-xs leading-relaxed text-slate-300 line-clamp-2">
                  {myProfile.bio}
                </p>
              ) : null}

              <div className="mt-4 grid grid-cols-3 border-y border-fuchsia-200/[0.08] py-3 text-center">
                <div>
                  <p className="font-mono text-sm font-semibold text-white tabular-nums">
                    {myProfile.postsCount}
                  </p>
                  <p className="text-[11px] text-slate-400">Posts</p>
                </div>
                <div>
                  <p className="font-mono text-sm font-semibold text-white tabular-nums">
                    {myProfile.followersCount}
                  </p>
                  <p className="text-[11px] text-slate-400">Followers</p>
                </div>
                <div>
                  <p className="font-mono text-sm font-semibold text-white tabular-nums">
                    {myProfile.followingCount}
                  </p>
                  <p className="text-[11px] text-slate-400">Following</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenProfile(myProfile.userId)}
                  className="rounded-lg border border-fuchsia-200/[0.12] bg-[#1A1328] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#231936] hover:text-white transition-colors cursor-pointer"
                >
                  My Profile
                </button>
                <button
                  type="button"
                  onClick={() => onOpenMessages()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-fuchsia-200/[0.12] bg-[#1A1328] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#231936] hover:text-white transition-colors cursor-pointer"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-fuchsia-400" />
                  <span>Inbox</span>
                </button>
              </div>
            </section>
          ) : null}

          {/* Suggested Members */}
          <section className="rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-sm font-semibold text-white">
                MAXAGRAM Members
              </h2>
              <button
                type="button"
                onClick={() => onOpenProfile(currentUserId)}
                className="text-xs text-fuchsia-400 hover:text-fuchsia-300 cursor-pointer"
              >
                Directory
              </button>
            </div>

            {suggestedMembers.length === 0 ? (
              <p className="text-xs text-slate-400">No other members registered yet.</p>
            ) : (
              <div className="space-y-3.5">
                {suggestedMembers.map((member) => (
                  <div key={member.userId} className="flex items-center justify-between gap-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(member.userId)}
                      className="flex items-center gap-2.5 min-w-0 text-left group cursor-pointer"
                    >
                      <Avatar
                        src={member.avatarUrl}
                        name={member.displayName}
                        size="sm"
                        isOnline={member.isOnline}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white group-hover:text-fuchsia-300 truncate">
                          {member.displayName}
                        </p>
                        <p className="font-mono text-[11px] text-slate-400 truncate">
                          @{member.username}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={followBusyId === member.userId}
                      onClick={() => handleSidebarFollow(member.userId)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                        member.isFollowing
                          ? 'border border-fuchsia-200/[0.14] bg-[#1A1328] text-slate-200 hover:text-white'
                          : 'bg-fuchsia-600 text-white hover:bg-fuchsia-500'
                      }`}
                    >
                      {member.isFollowing ? (
                        <>
                          <UserCheck className="h-3 w-3" />
                          <span>Following</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-3 w-3" />
                          <span>Follow</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Verified Downloads Catalog Shortcut */}
          <section className="rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-fuchsia-400">Verified Distribution</p>
                <h2 className="mt-1 font-display text-base font-semibold text-white">
                  Software Downloads
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Access {totalDownloadCount > 0 ? `${totalDownloadCount} verified releases` : 'verified studio packages'} sealed for your registered device.
                </p>
              </div>
              <Download className="h-5 w-5 shrink-0 text-fuchsia-400" />
            </div>
            <button
              type="button"
              onClick={onOpenDownloads}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-fuchsia-300/[0.18] bg-[#1A1328] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#251A3A] transition-colors cursor-pointer"
            >
              <span>Open Downloads Catalog</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-fuchsia-400" />
            </button>
          </section>
        </aside>
      </div>

      {/* Create Post Modal */}
      {composerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={() => setComposerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl border border-fuchsia-200/[0.14] bg-[#130F1B] p-6 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-fuchsia-200/[0.08] pb-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">
                  Share Photo or Video
                </h2>
                <p className="text-xs text-slate-400">
                  Post directly to the MAXAGRAM community feed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handlePublishPost} className="mt-5 space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                onChange={handleSelectMedia}
                className="hidden"
              />

              {mediaUrl ? (
                <div className="relative overflow-hidden rounded-xl border border-fuchsia-200/[0.12] bg-black">
                  {mediaType === 'video' ? (
                    <video
                      src={mediaUrl}
                      poster={posterUrl}
                      controls
                      playsInline
                      className="w-full max-h-[320px] object-contain"
                    />
                  ) : (
                    <img
                      src={mediaUrl}
                      alt="Post preview"
                      className="w-full max-h-[320px] object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMediaUrl('');
                      setPosterUrl(undefined);
                    }}
                    className="absolute top-2.5 right-2.5 rounded-lg bg-black/75 p-1.5 text-white hover:bg-black cursor-pointer"
                    aria-label="Remove media"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-fuchsia-400/30 bg-[#0F0B16] px-6 py-12 text-center hover:border-fuchsia-400/60 hover:bg-[#171124] transition-colors cursor-pointer disabled:opacity-60"
                >
                  <div className="flex items-center gap-2.5 text-fuchsia-400">
                    <ImagePlus className="h-6 w-6" />
                    <Film className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-white">
                    {uploading ? 'Processing & uploading media...' : 'Select a photo or video'}
                  </p>
                  <p className="text-xs text-slate-400">
                    JPG, PNG, WebP, GIF, MP4, WebM, MOV (up to 12 MB)
                  </p>
                </button>
              )}

              <div>
                <label htmlFor="post-caption" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Caption
                </label>
                <textarea
                  id="post-caption"
                  rows={3}
                  maxLength={1000}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write a caption for your photo or video..."
                  className="w-full rounded-lg border border-fuchsia-200/[0.12] bg-[#0B0810] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label htmlFor="post-location" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Location (optional)
                </label>
                <div className="relative flex items-center">
                  <MapPin className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-500" />
                  <input
                    id="post-location"
                    type="text"
                    maxLength={80}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="City, studio, or venue..."
                    className="w-full rounded-lg border border-fuchsia-200/[0.12] bg-[#0B0810] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
                  />
                </div>
              </div>

              {formError ? <p className="text-xs text-rose-400">{formError}</p> : null}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="rounded-lg border border-fuchsia-200/[0.12] px-4 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!mediaUrl || uploading || publishing}
                  className="rounded-lg bg-fuchsia-600 px-5 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {publishing ? 'Publishing...' : 'Publish Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
