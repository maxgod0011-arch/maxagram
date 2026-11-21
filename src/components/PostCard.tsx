import { useState } from 'react';
import {
  Film,
  Heart,
  MapPin,
  MessageCircle,
  Send,
  Trash2,
} from 'lucide-react';
import type { FeedPost } from '../../shared/types';
import { formatRelativeTime } from '../lib/time';
import { Avatar } from './Avatar';

interface PostCardProps {
  post: FeedPost;
  onToggleLike: (postId: string) => void;
  onAddComment: (postId: string, text: string) => Promise<void>;
  onDeleteComment: (postId: string, commentId: string) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  onOpenProfile: (userId: string) => void;
  onMessageUser: (userId: string) => void;
  defaultCommentsOpen?: boolean;
}

export function PostCard({
  post,
  onToggleLike,
  onAddComment,
  onDeleteComment,
  onDeletePost,
  onOpenProfile,
  onMessageUser,
  defaultCommentsOpen = false,
}: PostCardProps) {
  const [commentsExpanded, setCommentsExpanded] = useState(defaultCommentsOpen);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [commentError, setCommentError] = useState('');

  const visibleComments = commentsExpanded ? post.comments : post.comments.slice(-2);

  async function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || submittingComment) return;
    setSubmittingComment(true);
    setCommentError('');
    try {
      await onAddComment(post.id, trimmed);
      setCommentText('');
      setCommentsExpanded(true);
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Unable to post comment.');
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleDeletePostClick() {
    if (deletingPost) return;
    setDeletingPost(true);
    try {
      await onDeletePost(post.id);
    } finally {
      setDeletingPost(false);
    }
  }

  async function handleDeleteCommentClick(commentId: string) {
    if (deletingCommentId) return;
    setDeletingCommentId(commentId);
    try {
      await onDeleteComment(post.id, commentId);
    } finally {
      setDeletingCommentId(null);
    }
  }

  return (
    <article className="overflow-hidden rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B]">
      {/* Post Header */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5">
        <button
          type="button"
          onClick={() => onOpenProfile(post.authorId)}
          className="flex items-center gap-3 min-w-0 text-left group cursor-pointer"
        >
          <Avatar src={post.authorAvatar} name={post.authorName} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold text-white group-hover:text-fuchsia-300 transition-colors truncate">
                {post.authorName}
              </span>
              <span className="font-mono text-xs text-slate-400 truncate">
                @{post.authorUsername}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span>{formatRelativeTime(post.createdAt)}</span>
              {post.location ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-0.5 truncate">
                    <MapPin className="h-3 w-3 shrink-0 text-fuchsia-400/80" />
                    <span className="truncate">{post.location}</span>
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {post.mediaType === 'video' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-fuchsia-300/90 pr-1">
              <Film className="h-3.5 w-3.5" />
              <span>Video</span>
            </span>
          ) : null}
          {post.canDelete ? (
            <button
              type="button"
              onClick={handleDeletePostClick}
              disabled={deletingPost}
              aria-label="Delete post"
              title="Delete post"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Full-Bleed Photo or Video Stage */}
      <div className="relative bg-[#09060E] border-y border-fuchsia-200/[0.06]">
        {post.mediaType === 'video' ? (
          <video
            src={post.mediaUrl}
            poster={post.posterUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full max-h-[560px] object-contain bg-black"
          />
        ) : (
          <img
            src={post.mediaUrl}
            alt={post.caption || `Photo by ${post.authorName}`}
            referrerPolicy="no-referrer"
            className="w-full max-h-[580px] object-cover"
          />
        )}
      </div>

      {/* Actions + Caption + Comments */}
      <div className="px-4 sm:px-5 py-4 space-y-3">
        {/* Action Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => onToggleLike(post.id)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
                post.likedByMe
                  ? 'text-fuchsia-400'
                  : 'text-slate-300 hover:text-fuchsia-300'
              }`}
              aria-label={post.likedByMe ? 'Unlike post' : 'Like post'}
            >
              <Heart
                className={`h-5 w-5 transition-transform active:scale-90 ${
                  post.likedByMe ? 'fill-fuchsia-500 text-fuchsia-500' : ''
                }`}
              />
              <span className="font-mono tabular-nums">{post.likesCount}</span>
            </button>

            <button
              type="button"
              onClick={() => setCommentsExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
              aria-label="Toggle comments"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="font-mono tabular-nums">{post.commentsCount}</span>
            </button>
          </div>

          {!post.canDelete ? (
            <button
              type="button"
              onClick={() => onMessageUser(post.authorId)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-fuchsia-300 transition-colors cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Message</span>
            </button>
          ) : null}
        </div>

        {/* Caption */}
        {post.caption ? (
          <p className="text-sm leading-relaxed text-slate-200">
            <button
              type="button"
              onClick={() => onOpenProfile(post.authorId)}
              className="mr-1.5 font-semibold text-white hover:text-fuchsia-300 transition-colors cursor-pointer"
            >
              @{post.authorUsername}
            </button>
            <span>{post.caption}</span>
          </p>
        ) : null}

        {/* Comments List */}
        {post.comments.length > 0 ? (
          <div className="space-y-2.5 pt-1 border-t border-fuchsia-200/[0.06]">
            {!commentsExpanded && post.comments.length > 2 ? (
              <button
                type="button"
                onClick={() => setCommentsExpanded(true)}
                className="text-xs font-medium text-slate-400 hover:text-fuchsia-300 transition-colors cursor-pointer"
              >
                View all {post.comments.length} comments
              </button>
            ) : null}

            <div className="space-y-2">
              {visibleComments.map((comment) => (
                <div key={comment.id} className="group flex items-start justify-between gap-2.5 text-xs">
                  <div className="flex items-start gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(comment.authorId)}
                      className="shrink-0 mt-0.5 cursor-pointer"
                    >
                      <Avatar src={comment.authorAvatar} name={comment.authorName} size="xs" />
                    </button>
                    <div className="min-w-0">
                      <p className="leading-relaxed text-slate-200 break-words">
                        <button
                          type="button"
                          onClick={() => onOpenProfile(comment.authorId)}
                          className="mr-1.5 font-semibold text-white hover:text-fuchsia-300 cursor-pointer"
                        >
                          @{comment.authorUsername}
                        </button>
                        <span>{comment.text}</span>
                      </p>
                      <span className="text-[11px] text-slate-500">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                  </div>
                  {comment.canDelete ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteCommentClick(comment.id)}
                      disabled={deletingCommentId === comment.id}
                      aria-label="Delete comment"
                      className="shrink-0 rounded p-1 text-slate-500 opacity-70 hover:text-rose-400 hover:opacity-100 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Add Comment Composer */}
        <form
          onSubmit={handleCommentSubmit}
          className="flex items-center gap-2 pt-2 border-t border-fuchsia-200/[0.06]"
        >
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            maxLength={500}
            placeholder="Write a comment..."
            className="flex-1 bg-transparent py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!commentText.trim() || submittingComment}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-fuchsia-400 hover:bg-fuchsia-500/10 hover:text-fuchsia-300 transition-colors disabled:opacity-40 cursor-pointer"
          >
            {submittingComment ? 'Posting...' : 'Post'}
          </button>
        </form>
        {commentError ? <p className="text-xs text-rose-400">{commentError}</p> : null}
      </div>
    </article>
  );
}
