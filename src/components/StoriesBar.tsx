import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Film,
  ImagePlus,
  Pause,
  Play,
  Plus,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { PostMediaType, SocialProfile, StoryGroup } from '../../shared/types';
import { createStory, deleteStory, sendDirectMessage, viewStory } from '../lib/api';
import { prepareAndUploadMediaFile } from '../lib/media';
import { formatRelativeTime } from '../lib/time';
import { Avatar } from './Avatar';

interface StoriesBarProps {
  groups: StoryGroup[];
  myProfile: SocialProfile | null;
  currentUserId: string;
  onRefreshStories: () => void;
  onOpenProfile: (userId: string) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

const IMAGE_STORY_DURATION_MS = 6000;

export function StoriesBar({
  groups,
  myProfile,
  currentUserId,
  onRefreshStories,
  onOpenProfile,
  onNotify,
}: StoriesBarProps) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [viewerState, setViewerState] = useState<{
    groupIndex: number;
    storyIndex: number;
  } | null>(null);

  // Add Story Form State
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<PostMediaType>('image');
  const [caption, setCaption] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const myGroupIndex = groups.findIndex((g) => g.authorId === currentUserId);
  const myGroup = myGroupIndex >= 0 ? groups[myGroupIndex] : null;
  const otherGroups = groups.filter((g) => g.authorId !== currentUserId);

  function resetAddForm() {
    setMediaUrl('');
    setMediaType('image');
    setCaption('');
    setUploadError('');
    setUploading(false);
    setSubmitting(false);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const uploaded = await prepareAndUploadMediaFile(file, { maxDimension: 1280, allowVideo: true });
      setMediaUrl(uploaded.mediaUrl);
      setMediaType(uploaded.mediaType);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not upload story media.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleCreateStory(e: React.FormEvent) {
    e.preventDefault();
    if (!mediaUrl) {
      setUploadError('Select a photo or video to publish to your 24h story.');
      return;
    }
    setSubmitting(true);
    setUploadError('');
    try {
      await createStory({ mediaType, mediaUrl, caption });
      setAddModalOpen(false);
      resetAddForm();
      onRefreshStories();
      onNotify('success', 'Story published for 24 hours.');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to publish story.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label="24-hour Stories" className="rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-sm font-semibold text-white tracking-tight">
          Stories · 24h
        </h2>
        <button
          type="button"
          onClick={() => {
            resetAddForm();
            setAddModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-fuchsia-400 hover:text-fuchsia-300 transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Story</span>
        </button>
      </div>

      <div className="flex items-start gap-4 overflow-x-auto pb-1">
        {/* Viewer's Own Story Tile */}
        <div className="flex flex-col items-center gap-1.5 shrink-0 w-[72px]">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (myGroup && myGroup.stories.length > 0) {
                  setViewerState({ groupIndex: myGroupIndex, storyIndex: 0 });
                } else {
                  resetAddForm();
                  setAddModalOpen(true);
                }
              }}
              className="block rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              aria-label={myGroup ? 'View your story' : 'Add your story'}
            >
              <Avatar
                src={myProfile?.avatarUrl}
                name={myProfile?.displayName || 'You'}
                size="lg"
                storyRing={myGroup ? (myGroup.hasUnseen ? 'unseen' : 'seen') : 'none'}
              />
            </button>
            <button
              type="button"
              onClick={() => {
                resetAddForm();
                setAddModalOpen(true);
              }}
              aria-label="Add new story"
              className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-600 text-white ring-2 ring-[#130F1B] hover:bg-fuchsia-500 transition-colors cursor-pointer"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <span className="w-full truncate text-center text-[11px] text-slate-300">
            Your Story
          </span>
        </div>

        {/* Other Members' Active Story Groups */}
        {otherGroups.map((group) => {
          const fullIndex = groups.findIndex((g) => g.authorId === group.authorId);
          return (
            <button
              key={group.authorId}
              type="button"
              onClick={() => setViewerState({ groupIndex: fullIndex, storyIndex: 0 })}
              className="group flex flex-col items-center gap-1.5 shrink-0 w-[72px] cursor-pointer focus:outline-none"
            >
              <Avatar
                src={group.authorAvatar}
                name={group.authorName}
                size="lg"
                storyRing={group.hasUnseen ? 'unseen' : 'seen'}
                className="transition-transform duration-150 group-hover:scale-105"
              />
              <span className="w-full truncate text-center text-[11px] text-slate-300 group-hover:text-white transition-colors">
                {group.authorUsername}
              </span>
            </button>
          );
        })}
      </div>

      {/* Add Story Modal */}
      {addModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={() => setAddModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-fuchsia-200/[0.14] bg-[#130F1B] p-6"
          >
            <div className="flex items-center justify-between border-b border-fuchsia-200/[0.08] pb-4">
              <div>
                <h3 className="font-display text-lg font-semibold text-white">Share to Story</h3>
                <p className="text-xs text-slate-400">Visible to MAXAGRAM members for 24 hours.</p>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStory} className="mt-5 space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                onChange={handleFileSelect}
                className="hidden"
              />

              {mediaUrl ? (
                <div className="relative overflow-hidden rounded-xl border border-fuchsia-200/[0.12] bg-[#0B0810] aspect-[9/12] max-h-[340px] mx-auto flex items-center justify-center">
                  {mediaType === 'video' ? (
                    <video
                      src={mediaUrl}
                      controls
                      playsInline
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <img
                      src={mediaUrl}
                      alt="Story preview"
                      className="h-full w-full object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setMediaUrl('')}
                    className="absolute top-2.5 right-2.5 rounded-lg bg-black/70 p-1.5 text-white hover:bg-black cursor-pointer"
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
                  <div className="flex items-center gap-2 text-fuchsia-400">
                    <ImagePlus className="h-6 w-6" />
                    <Film className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-white">
                    {uploading ? 'Uploading media...' : 'Choose a photo or short video'}
                  </p>
                  <p className="text-xs text-slate-400">JPG, PNG, WebP, GIF, MP4, WebM up to 12 MB</p>
                </button>
              )}

              <div>
                <label htmlFor="story-caption" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Caption (optional)
                </label>
                <input
                  id="story-caption"
                  type="text"
                  maxLength={220}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a quick note or moment..."
                  className="w-full rounded-lg border border-fuchsia-200/[0.12] bg-[#0B0810] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
                />
              </div>

              {uploadError ? (
                <p className="text-xs text-rose-400">{uploadError}</p>
              ) : null}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="rounded-lg border border-fuchsia-200/[0.12] px-4 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!mediaUrl || uploading || submitting}
                  className="rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Publishing...' : 'Publish Story'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Full-Screen Story Viewer */}
      {viewerState && groups[viewerState.groupIndex] ? (
        <StoryViewerModal
          groups={groups}
          groupIndex={viewerState.groupIndex}
          storyIndex={viewerState.storyIndex}
          currentUserId={currentUserId}
          onChangeIndex={(gIdx, sIdx) => setViewerState({ groupIndex: gIdx, storyIndex: sIdx })}
          onClose={() => setViewerState(null)}
          onOpenProfile={(uid) => {
            setViewerState(null);
            onOpenProfile(uid);
          }}
          onRefreshStories={onRefreshStories}
          onNotify={onNotify}
        />
      ) : null}
    </section>
  );
}

interface StoryViewerModalProps {
  groups: StoryGroup[];
  groupIndex: number;
  storyIndex: number;
  currentUserId: string;
  onChangeIndex: (groupIndex: number, storyIndex: number) => void;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onRefreshStories: () => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

function StoryViewerModal({
  groups,
  groupIndex,
  storyIndex,
  currentUserId,
  onChangeIndex,
  onClose,
  onOpenProfile,
  onRefreshStories,
  onNotify,
}: StoryViewerModalProps) {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewedIdsRef = useRef<Set<string>>(new Set());

  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];

  const goNext = useCallback(() => {
    if (!group) {
      onClose();
      return;
    }
    if (storyIndex + 1 < group.stories.length) {
      onChangeIndex(groupIndex, storyIndex + 1);
    } else if (groupIndex + 1 < groups.length) {
      onChangeIndex(groupIndex + 1, 0);
    } else {
      onClose();
    }
  }, [group, groupIndex, groups.length, onChangeIndex, onClose, storyIndex]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      onChangeIndex(groupIndex, storyIndex - 1);
    } else if (groupIndex > 0) {
      const prevGroup = groups[groupIndex - 1];
      onChangeIndex(groupIndex - 1, Math.max(0, prevGroup.stories.length - 1));
    }
  }, [groupIndex, groups, onChangeIndex, storyIndex]);

  // Mark story viewed on server once
  useEffect(() => {
    if (!story) return;
    setProgress(0);
    if (!story.viewedByMe && !viewedIdsRef.current.has(story.id)) {
      viewedIdsRef.current.add(story.id);
      viewStory(story.id)
        .then(() => onRefreshStories())
        .catch(() => {});
    }
  }, [story, onRefreshStories]);

  // Auto-advance timer for image stories
  useEffect(() => {
    if (!story || story.mediaType === 'video' || paused) return;

    const stepMs = 60;
    const increment = (stepMs / IMAGE_STORY_DURATION_MS) * 100;
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (prev + increment >= 100) {
          window.clearInterval(timer);
          window.setTimeout(goNext, 0);
          return 100;
        }
        return prev + increment;
      });
    }, stepMs);

    return () => window.clearInterval(timer);
  }, [story, paused, goNext]);

  // Sync video pause/play
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (paused) {
      el.pause();
    } else {
      el.play().catch(() => {});
    }
  }, [paused, story?.id]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') onClose();
        return;
      }
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, onClose]);

  if (!group || !story) return null;

  async function handleQuickReply(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = replyText.trim();
    if (!trimmed || sendingReply || !story) return;
    setSendingReply(true);
    try {
      await sendDirectMessage(story.authorId, {
        text: trimmed,
        storyRefId: story.id,
      });
      setReplyText('');
      onNotify('success', `Reply sent to @${story.authorUsername}`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to send story reply.');
    } finally {
      setSendingReply(false);
    }
  }

  async function handleDeleteCurrentStory() {
    if (!story || deleting) return;
    setDeleting(true);
    try {
      await deleteStory(story.id);
      onRefreshStories();
      onNotify('success', 'Story deleted.');
      onClose();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not delete story.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#06040A]/95 p-3 sm:p-6 backdrop-blur-md"
      onClick={onClose}
    >
      {/* Previous Arrow */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          goPrev();
        }}
        disabled={groupIndex === 0 && storyIndex === 0}
        aria-label="Previous story"
        className="hidden sm:flex mr-4 h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:bg-white/15 disabled:opacity-30 cursor-pointer"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* 9:16 Editorial Story Frame */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[88vh] max-h-[780px] w-full max-w-[430px] flex-col overflow-hidden rounded-2xl border border-fuchsia-200/[0.15] bg-[#0E0A14] shadow-2xl"
      >
        {/* Media Canvas */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          {story.mediaType === 'video' ? (
            <video
              ref={videoRef}
              key={story.id}
              src={story.mediaUrl}
              autoPlay
              playsInline
              muted={muted}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration > 0) {
                  setProgress(Math.min(100, (v.currentTime / v.duration) * 100));
                }
              }}
              onEnded={goNext}
              className="h-full w-full object-cover"
            />
          ) : (
            <img
              key={story.id}
              src={story.mediaUrl}
              alt={story.caption || `${story.authorName}'s story`}
              className="h-full w-full object-cover"
            />
          )}

          {/* Tap Left / Right Invisible Navigation Zones */}
          <button
            type="button"
            aria-label="Previous slide"
            onClick={goPrev}
            className="absolute inset-y-16 left-0 w-1/3 cursor-pointer"
          />
          <button
            type="button"
            aria-label="Next slide"
            onClick={goNext}
            className="absolute inset-y-16 right-0 w-1/3 cursor-pointer"
          />

          {/* Top Gradient Scrim + Progress + Header */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 via-black/40 to-transparent" />
          <div className="absolute inset-x-0 top-0 p-3.5">
            {/* Segmented Progress Bars */}
            <div className="flex gap-1.5 mb-3">
              {group.stories.map((item, idx) => {
                const widthPct =
                  idx < storyIndex ? 100 : idx === storyIndex ? progress : 0;
                return (
                  <div
                    key={item.id}
                    className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25"
                  >
                    <div
                      className="h-full bg-fuchsia-400 transition-[width] duration-75"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onOpenProfile(story.authorId)}
                className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
              >
                <Avatar src={story.authorAvatar} name={story.authorName} size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{story.authorName}</p>
                  <p className="text-[11px] text-slate-300 truncate">
                    @{story.authorUsername} · {formatRelativeTime(story.createdAt)}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-slate-200 tabular-nums">
                  <Eye className="h-3.5 w-3.5 text-fuchsia-300" />
                  {story.viewsCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  aria-label={paused ? 'Resume story' : 'Pause story'}
                  className="rounded-lg p-1.5 text-white/90 hover:bg-white/15 cursor-pointer"
                >
                  {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </button>
                {story.mediaType === 'video' ? (
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    aria-label={muted ? 'Unmute video' : 'Mute video'}
                    className="rounded-lg p-1.5 text-white/90 hover:bg-white/15 cursor-pointer"
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                ) : null}
                {story.canDelete ? (
                  <button
                    type="button"
                    onClick={handleDeleteCurrentStory}
                    disabled={deleting}
                    aria-label="Delete story"
                    className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close story viewer"
                  className="rounded-lg p-1.5 text-white/90 hover:bg-white/15 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Caption & Quick DM Reply */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 space-y-3">
            {story.caption ? (
              <p className="text-sm leading-relaxed text-white drop-shadow-xs">
                {story.caption}
              </p>
            ) : null}

            {story.authorId !== currentUserId ? (
              <form onSubmit={handleQuickReply} className="flex items-center gap-2">
                <input
                  type="text"
                  value={replyText}
                  onFocus={() => setPaused(true)}
                  onBlur={() => setPaused(false)}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to @${story.authorUsername}...`}
                  className="flex-1 rounded-lg border border-white/20 bg-black/50 px-3.5 py-2 text-xs text-white placeholder:text-slate-300 focus:border-fuchsia-400 focus:outline-none backdrop-blur-xs"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || sendingReply}
                  className="inline-flex items-center justify-center rounded-lg bg-fuchsia-600 p-2 text-white hover:bg-fuchsia-500 disabled:opacity-40 cursor-pointer"
                  aria-label="Send story reply"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>

      {/* Next Arrow */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          goNext();
        }}
        aria-label="Next story"
        className="hidden sm:flex ml-4 h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:bg-white/15 cursor-pointer"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
