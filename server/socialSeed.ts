import type { PostMediaType } from '../shared/types.ts';

export interface StoredSocialProfile {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  location: string;
  website: string;
  avatarUrl: string;
  joinedAt: string;
}

export interface StoredFollow {
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface StoredComment {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  createdAt: string;
}

export interface StoredPost {
  id: string;
  authorId: string;
  mediaType: PostMediaType;
  mediaUrl: string;
  posterUrl?: string;
  caption: string;
  location: string;
  likedBy: string[];
  comments: StoredComment[];
  createdAt: string;
}

export interface StoredStory {
  id: string;
  authorId: string;
  mediaType: PostMediaType;
  mediaUrl: string;
  caption: string;
  createdAt: string;
  expiresAt: string;
  viewedBy: string[];
}

export interface StoredDirectMessage {
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

export const AVATAR_ELENA = '/src/assets/images/avatar_elena_portrait_1795143707971.jpg';
export const AVATAR_MARCUS = '/src/assets/images/avatar_marcus_portrait_1795143707230.jpg';
export const FEED_TOKYO = '/src/assets/images/feed_tokyo_architecture_1795143708723.jpg';
export const FEED_CINEMA = '/src/assets/images/feed_cinema_rig_1795143708307.jpg';
export const STORY_ALPINE = '/src/assets/images/story_alpine_dusk_1795143707688.jpg';
export const COVER_AUDIO = '/src/assets/images/cover_audio_studio_1795098371788.jpg';
export const COVER_CREATIVE = '/src/assets/images/cover_creative_suite_1795098371414.jpg';

export function buildConversationId(userA: string, userB: string): string {
  return [userA, userB].sort().join('__');
}

export function createSeedSocialData(): {
  profiles: StoredSocialProfile[];
  follows: StoredFollow[];
  posts: StoredPost[];
  stories: StoredStory[];
  messages: StoredDirectMessage[];
} {
  const now = Date.now();
  const h = 60 * 60 * 1000;

  const profiles: StoredSocialProfile[] = [
    {
      userId: 'reg-seed-101',
      username: 'elena.vance',
      displayName: 'Elena Vance',
      bio: 'Creative director & architectural photographer. Shooting medium format light studies across Tokyo and Stockholm.',
      location: 'Stockholm, SE',
      website: 'studio-nord.io',
      avatarUrl: AVATAR_ELENA,
      joinedAt: '2026-11-14T10:22:00.000Z',
    },
    {
      userId: 'reg-seed-102',
      username: 'marcus.chen',
      displayName: 'Marcus Chen',
      bio: 'Cinematographer & colorist building custom 10-bit grading pipelines and studio sound decks.',
      location: 'Vancouver, CA',
      website: 'aperturelabs.dev',
      avatarUrl: AVATAR_MARCUS,
      joinedAt: '2026-11-16T08:15:00.000Z',
    },
    {
      userId: 'reg-seed-103',
      username: 'sora.audio',
      displayName: 'Sora Takahashi',
      bio: 'Mastering engineer exploring analog tape saturation, modular synths, and spatial acoustics.',
      location: 'Osaka, JP',
      website: 'kurokawa-audio.jp',
      avatarUrl: COVER_AUDIO,
      joinedAt: '2026-11-11T21:40:00.000Z',
    },
  ];

  const follows: StoredFollow[] = [
    {
      followerId: 'reg-seed-101',
      followingId: 'reg-seed-102',
      createdAt: new Date(now - 48 * h).toISOString(),
    },
    {
      followerId: 'reg-seed-102',
      followingId: 'reg-seed-101',
      createdAt: new Date(now - 44 * h).toISOString(),
    },
    {
      followerId: 'reg-seed-103',
      followingId: 'reg-seed-101',
      createdAt: new Date(now - 36 * h).toISOString(),
    },
  ];

  const posts: StoredPost[] = [
    {
      id: 'post-seed-1',
      authorId: 'reg-seed-101',
      mediaType: 'image',
      mediaUrl: FEED_TOKYO,
      caption:
        'Rain-washed concrete reflections outside the gallery just after sunset. Graded straight out of Kinetix Studio with a custom warm shadow LUT.',
      location: 'Minato City, Tokyo',
      likedBy: ['reg-seed-102', 'reg-seed-103'],
      comments: [
        {
          id: 'cmt-seed-1',
          postId: 'post-seed-1',
          authorId: 'reg-seed-102',
          text: 'The contrast between the warm interior bounce and twilight cobalt sky is unreal.',
          createdAt: new Date(now - 4 * h).toISOString(),
        },
      ],
      createdAt: new Date(now - 5 * h).toISOString(),
    },
    {
      id: 'post-seed-2',
      authorId: 'reg-seed-102',
      mediaType: 'image',
      mediaUrl: FEED_CINEMA,
      caption:
        'Late afternoon lens calibration and reference monitor check before locking our short film color pass. Prime glass lined up and ready.',
      location: 'Aperture Stage B, Vancouver',
      likedBy: ['reg-seed-101'],
      comments: [
        {
          id: 'cmt-seed-2',
          postId: 'post-seed-2',
          authorId: 'reg-seed-101',
          text: 'Cleanest grading desk setup on MAXAGRAM. Looking forward to seeing the final reel.',
          createdAt: new Date(now - 8 * h).toISOString(),
        },
      ],
      createdAt: new Date(now - 10 * h).toISOString(),
    },
    {
      id: 'post-seed-3',
      authorId: 'reg-seed-103',
      mediaType: 'image',
      mediaUrl: COVER_AUDIO,
      caption:
        'Tracking analog mastering chains at 96kHz tonight. Testing sub-2ms roundtrip latency on the updated PulseAudio Rack.',
      location: 'Kurokawa Sound Lab, Osaka',
      likedBy: ['reg-seed-101', 'reg-seed-102'],
      comments: [],
      createdAt: new Date(now - 18 * h).toISOString(),
    },
  ];

  const stories: StoredStory[] = [
    {
      id: 'story-seed-1',
      authorId: 'reg-seed-101',
      mediaType: 'image',
      mediaUrl: STORY_ALPINE,
      caption: 'Last light over the alpine ridge — location scouting for next month’s monograph.',
      createdAt: new Date(now - 2 * h).toISOString(),
      expiresAt: new Date(now + 22 * h).toISOString(),
      viewedBy: ['reg-seed-102'],
    },
    {
      id: 'story-seed-2',
      authorId: 'reg-seed-102',
      mediaType: 'image',
      mediaUrl: FEED_CINEMA,
      caption: 'On set calibrating anamorphic primes before tonight’s shoot.',
      createdAt: new Date(now - 3 * h).toISOString(),
      expiresAt: new Date(now + 21 * h).toISOString(),
      viewedBy: [],
    },
    {
      id: 'story-seed-3',
      authorId: 'reg-seed-103',
      mediaType: 'image',
      mediaUrl: COVER_CREATIVE,
      caption: 'Visual shader tests paired with modular synth stems.',
      createdAt: new Date(now - 4 * h).toISOString(),
      expiresAt: new Date(now + 20 * h).toISOString(),
      viewedBy: [],
    },
  ];

  const messages: StoredDirectMessage[] = [
    {
      id: 'dm-seed-1',
      conversationId: buildConversationId('reg-seed-101', 'reg-seed-102'),
      senderId: 'reg-seed-101',
      recipientId: 'reg-seed-102',
      text: 'Just shared the Tokyo dusk architecture frames on the feed — let me know what you think of the shadow roll-off.',
      createdAt: new Date(now - 4.5 * h).toISOString(),
      readAt: new Date(now - 4 * h).toISOString(),
    },
  ];

  return { profiles, follows, posts, stories, messages };
}
