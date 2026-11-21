import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ImagePlus,
  MessageSquarePlus,
  Search,
  Send,
  User,
  X,
} from 'lucide-react';
import type {
  ConversationSummary,
  DirectMessage,
  PostMediaType,
  SocialProfile,
} from '../../shared/types';
import { fetchConversationMessages, sendDirectMessage } from '../lib/api';
import { prepareAndUploadMediaFile } from '../lib/media';
import { formatMessageTime, formatRelativeTime } from '../lib/time';
import { Avatar } from './Avatar';

interface MessagesPageProps {
  currentUserId: string;
  selectedPeerId: string | null;
  conversations: ConversationSummary[];
  profiles: SocialProfile[];
  realtimeIncomingMessage: DirectMessage | null;
  realtimeReadReceipt: { conversationId: string; readerId: string; readAt: string } | null;
  onSelectPeer: (peerId: string | null) => void;
  onConversationsChanged: () => void;
  onOpenProfile: (userId: string) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

export function MessagesPage({
  currentUserId,
  selectedPeerId,
  conversations,
  profiles,
  realtimeIncomingMessage,
  realtimeReadReceipt,
  onSelectPeer,
  onConversationsChanged,
  onOpenProfile,
  onNotify,
}: MessagesPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [newChatMode, setNewChatMode] = useState(false);
  const [activePeer, setActivePeer] = useState<SocialProfile | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  const [draftText, setDraftText] = useState('');
  const [attachment, setAttachment] = useState<{
    mediaUrl: string;
    mediaType: PostMediaType;
  } | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [sending, setSending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const otherMembers = useMemo(
    () => profiles.filter((p) => p.userId !== currentUserId),
    [profiles, currentUserId]
  );

  // Keep activePeer's live online status synced with profiles list
  const syncedActivePeer = useMemo(() => {
    if (!activePeer) return null;
    const latest = profiles.find((p) => p.userId === activePeer.userId);
    return latest || activePeer;
  }, [activePeer, profiles]);

  // Load thread whenever selectedPeerId changes
  useEffect(() => {
    if (!selectedPeerId) {
      setActivePeer(null);
      setActiveConversationId(null);
      setMessages([]);
      return;
    }

    let cancelled = false;
    setLoadingThread(true);
    fetchConversationMessages(selectedPeerId)
      .then((res) => {
        if (cancelled) return;
        setActivePeer(res.peer);
        setActiveConversationId(res.conversationId);
        setMessages(res.messages);
        onConversationsChanged();
      })
      .catch((err) => {
        if (cancelled) return;
        onNotify('error', err instanceof Error ? err.message : 'Unable to open conversation.');
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPeerId, onConversationsChanged, onNotify]);

  // Append incoming realtime message if it belongs to the currently open thread
  useEffect(() => {
    if (!realtimeIncomingMessage || !selectedPeerId) return;
    const belongsToThread =
      (realtimeIncomingMessage.senderId === selectedPeerId &&
        realtimeIncomingMessage.recipientId === currentUserId) ||
      (realtimeIncomingMessage.senderId === currentUserId &&
        realtimeIncomingMessage.recipientId === selectedPeerId);

    if (!belongsToThread) return;

    setMessages((prev) => {
      if (prev.some((m) => m.id === realtimeIncomingMessage.id)) return prev;
      return [...prev, realtimeIncomingMessage];
    });

    // If message came from peer while we're actively viewing this thread, mark read on server
    if (realtimeIncomingMessage.senderId === selectedPeerId) {
      fetchConversationMessages(selectedPeerId)
        .then(() => onConversationsChanged())
        .catch(() => {});
    }
  }, [realtimeIncomingMessage, selectedPeerId, currentUserId, onConversationsChanged]);

  // Update read receipts live when peer reads our messages
  useEffect(() => {
    if (!realtimeReadReceipt || !activeConversationId) return;
    if (realtimeReadReceipt.conversationId !== activeConversationId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.recipientId === realtimeReadReceipt.readerId && m.readAt === null
          ? { ...m, readAt: realtimeReadReceipt.readAt }
          : m
      )
    );
  }, [realtimeReadReceipt, activeConversationId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedPeerId]);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.peer.displayName.toLowerCase().includes(q) ||
        c.peer.username.toLowerCase().includes(q) ||
        (c.lastMessage?.text || '').toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const filteredDirectory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return otherMembers;
    return otherMembers.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q)
    );
  }, [otherMembers, searchQuery]);

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMedia(true);
    try {
      const uploaded = await prepareAndUploadMediaFile(file, {
        maxDimension: 1200,
        allowVideo: true,
      });
      setAttachment({ mediaUrl: uploaded.mediaUrl, mediaType: uploaded.mediaType });
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to attach media.');
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPeerId || sending) return;
    const trimmed = draftText.trim();
    if (!trimmed && !attachment) return;

    setSending(true);
    try {
      const res = await sendDirectMessage(selectedPeerId, {
        text: trimmed,
        mediaType: attachment?.mediaType,
        mediaUrl: attachment?.mediaUrl,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      setDraftText('');
      setAttachment(null);
      onConversationsChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 sm:px-6 py-6">
      <div className="flex h-[calc(100vh-148px)] min-h-[540px] overflow-hidden rounded-xl border border-fuchsia-200/[0.1] bg-[#130F1B]">
        {/* Left Conversation Inbox Pane */}
        <aside
          className={`w-full lg:w-[330px] shrink-0 flex-col border-r border-fuchsia-200/[0.08] ${
            selectedPeerId ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="border-b border-fuchsia-200/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h1 className="font-display text-lg font-semibold text-white">
                {newChatMode ? 'New Message' : 'Messages'}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setNewChatMode((v) => !v);
                  setSearchQuery('');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200/[0.12] bg-[#1B1427] px-2.5 py-1.5 text-xs font-medium text-fuchsia-300 hover:bg-[#241A36] transition-colors cursor-pointer"
              >
                {newChatMode ? (
                  <>
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Inbox</span>
                  </>
                ) : (
                  <>
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    <span>New Chat</span>
                  </>
                )}
              </button>
            </div>

            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={newChatMode ? 'Find a member to message...' : 'Search conversations...'}
                className="w-full rounded-lg border border-fuchsia-200/[0.1] bg-[#0B0810] py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-fuchsia-200/[0.05]">
            {newChatMode ? (
              filteredDirectory.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-400">
                  No matching MAXAGRAM members found.
                </p>
              ) : (
                filteredDirectory.map((member) => (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => {
                      setNewChatMode(false);
                      setSearchQuery('');
                      onSelectPeer(member.userId);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <Avatar
                      src={member.avatarUrl}
                      name={member.displayName}
                      size="md"
                      isOnline={member.isOnline}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">
                        {member.displayName}
                      </p>
                      <p className="font-mono text-xs text-slate-400 truncate">
                        @{member.username}
                      </p>
                    </div>
                  </button>
                ))
              )
            ) : filteredConversations.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-slate-400">
                  {conversations.length === 0
                    ? 'No direct messages yet. Start a private conversation with any member.'
                    : 'No conversations match your search.'}
                </p>
                <button
                  type="button"
                  onClick={() => setNewChatMode(true)}
                  className="rounded-lg bg-fuchsia-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 cursor-pointer"
                >
                  Start New Chat
                </button>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.peer.userId === selectedPeerId;
                const previewText = conv.lastMessage
                  ? conv.lastMessage.text ||
                    (conv.lastMessage.mediaType === 'video' ? 'Shared a video' : 'Shared a photo')
                  : 'Start chatting';

                return (
                  <button
                    key={conv.conversationId}
                    type="button"
                    onClick={() => onSelectPeer(conv.peer.userId)}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-fuchsia-600/15 border-l-2 border-l-fuchsia-500'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <Avatar
                      src={conv.peer.avatarUrl}
                      name={conv.peer.displayName}
                      size="md"
                      isOnline={conv.peer.isOnline}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white truncate">
                          {conv.peer.displayName}
                        </p>
                        <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">
                          {formatRelativeTime(conv.updatedAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p
                          className={`text-xs truncate ${
                            conv.unreadCount > 0 ? 'font-medium text-slate-100' : 'text-slate-400'
                          }`}
                        >
                          {conv.lastMessage?.senderId === currentUserId ? 'You: ' : ''}
                          {previewText}
                        </p>
                        {conv.unreadCount > 0 ? (
                          <span className="shrink-0 font-mono text-[11px] font-semibold text-fuchsia-400 tabular-nums">
                            {conv.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Active Chat Pane */}
        <section
          className={`flex-1 flex-col min-w-0 ${
            selectedPeerId ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!selectedPeerId || !syncedActivePeer ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-400">
                <Send className="h-6 w-6" />
              </div>
              <h2 className="mt-4 font-display text-xl font-semibold text-white">
                Direct Messages
              </h2>
              <p className="mt-2 max-w-sm text-sm text-slate-400">
                Select a conversation on the left or start a new private thread with any registered
                MAXAGRAM member.
              </p>
              <button
                type="button"
                onClick={() => setNewChatMode(true)}
                className="mt-5 rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 cursor-pointer"
              >
                New Message
              </button>
            </div>
          ) : (
            <>
              {/* Active Thread Header */}
              <div className="flex items-center justify-between gap-3 border-b border-fuchsia-200/[0.08] px-4 sm:px-5 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelectPeer(null)}
                    aria-label="Back to conversations"
                    className="lg:hidden rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenProfile(syncedActivePeer.userId)}
                    className="flex items-center gap-3 min-w-0 text-left group cursor-pointer"
                  >
                    <Avatar
                      src={syncedActivePeer.avatarUrl}
                      name={syncedActivePeer.displayName}
                      size="sm"
                      isOnline={syncedActivePeer.isOnline}
                    />
                    <div className="min-w-0">
                      <p className="font-display text-sm font-semibold text-white group-hover:text-fuchsia-300 truncate">
                        {syncedActivePeer.displayName}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        @{syncedActivePeer.username}
                        {syncedActivePeer.isOnline ? (
                          <span className="ml-1.5 text-emerald-400">· Online now</span>
                        ) : null}
                      </p>
                    </div>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenProfile(syncedActivePeer.userId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200/[0.12] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.05] hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  <User className="h-3.5 w-3.5" />
                  <span>Profile</span>
                </button>
              </div>

              {/* Messages Stream */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-3 bg-[#0E0A14]">
                {loadingThread ? (
                  <p className="text-center text-xs text-slate-400 py-10">Loading conversation...</p>
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-sm font-medium text-slate-200">
                      Say hello to {syncedActivePeer.displayName}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Messages and media shared here are delivered in real time.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.senderId === currentUserId;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[78%] sm:max-w-[68%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                            isMine
                              ? 'bg-fuchsia-600 text-white rounded-br-sm'
                              : 'border border-fuchsia-200/[0.09] bg-[#171222] text-slate-100 rounded-bl-sm'
                          }`}
                        >
                          {msg.storyRefId ? (
                            <p
                              className={`mb-1.5 text-[11px] font-medium ${
                                isMine ? 'text-fuchsia-100/90' : 'text-fuchsia-300'
                              }`}
                            >
                              Replied to story
                            </p>
                          ) : null}

                          {msg.mediaUrl ? (
                            <div className="mb-2 overflow-hidden rounded-lg bg-black/40">
                              {msg.mediaType === 'video' ? (
                                <video
                                  src={msg.mediaUrl}
                                  controls
                                  playsInline
                                  className="max-h-[260px] w-full object-contain"
                                />
                              ) : (
                                <img
                                  src={msg.mediaUrl}
                                  alt="Message attachment"
                                  className="max-h-[280px] w-full object-cover"
                                />
                              )}
                            </div>
                          ) : null}

                          {msg.text ? (
                            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                          ) : null}
                        </div>

                        <div className="mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-500 tabular-nums">
                          <span>{formatMessageTime(msg.createdAt)}</span>
                          {isMine ? (
                            msg.readAt ? (
                              <span className="inline-flex items-center gap-0.5 text-fuchsia-400">
                                <CheckCheck className="h-3 w-3" />
                                <span>Seen</span>
                              </span>
                            ) : (
                              <Check className="h-3 w-3 text-slate-500" />
                            )
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <form
                onSubmit={handleSendMessage}
                className="border-t border-fuchsia-200/[0.08] bg-[#130F1B] p-3.5 sm:p-4 space-y-2.5"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                  onChange={handleAttachFile}
                  className="hidden"
                />

                {attachment ? (
                  <div className="inline-flex items-center gap-2.5 rounded-lg border border-fuchsia-300/20 bg-[#1B1427] p-2 pr-3">
                    {attachment.mediaType === 'video' ? (
                      <video
                        src={attachment.mediaUrl}
                        className="h-12 w-12 rounded object-cover bg-black"
                      />
                    ) : (
                      <img
                        src={attachment.mediaUrl}
                        alt="Pending attachment"
                        className="h-12 w-12 rounded object-cover"
                      />
                    )}
                    <span className="text-xs text-slate-200">
                      {attachment.mediaType === 'video' ? 'Video attached' : 'Photo attached'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      aria-label="Remove attachment"
                      className="rounded p-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingMedia}
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach photo or video"
                    aria-label="Attach photo or video"
                    className="rounded-lg border border-fuchsia-200/[0.12] bg-[#0B0810] p-2.5 text-slate-300 hover:border-fuchsia-400/40 hover:text-fuchsia-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <ImagePlus className="h-4 w-4" />
                  </button>

                  <input
                    type="text"
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    maxLength={2000}
                    placeholder={
                      uploadingMedia
                        ? 'Uploading attachment...'
                        : `Message @${syncedActivePeer.username}...`
                    }
                    className="flex-1 rounded-lg border border-fuchsia-200/[0.12] bg-[#0B0810] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
                  />

                  <button
                    type="submit"
                    disabled={(!draftText.trim() && !attachment) || uploadingMedia || sending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-fuchsia-500 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
