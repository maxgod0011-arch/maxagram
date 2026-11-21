import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PostMediaType } from '../shared/types.ts';

const IS_SERVERLESS = Boolean(
  process.env.VERCEL === '1' ||
    process.env.VERCEL_ENV ||
    process.env.NETLIFY === 'true' ||
    process.env.NETLIFY_LOCAL === 'true' ||
    process.env.SITE_ID ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
);

const DATA_DIR = process.env.MAXAGRAM_DATA_DIR
  ? path.resolve(process.env.MAXAGRAM_DATA_DIR)
  : IS_SERVERLESS
    ? path.join(os.tmpdir(), 'maxagram-data')
    : path.resolve(process.cwd(), 'data');

const MEDIA_DIR = path.join(DATA_DIR, 'media');

const MIME_TO_EXT: Record<string, { ext: string; mediaType: PostMediaType }> = {
  'image/jpeg': { ext: 'jpg', mediaType: 'image' },
  'image/jpg': { ext: 'jpg', mediaType: 'image' },
  'image/png': { ext: 'png', mediaType: 'image' },
  'image/webp': { ext: 'webp', mediaType: 'image' },
  'image/gif': { ext: 'gif', mediaType: 'image' },
  'video/mp4': { ext: 'mp4', mediaType: 'video' },
  'video/webm': { ext: 'webm', mediaType: 'video' },
  'video/quicktime': { ext: 'mov', mediaType: 'video' },
};

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

const MAX_BYTES_LOCAL = 12 * 1024 * 1024; // 12 MB locally
const MAX_BYTES_SERVERLESS = 3.5 * 1024 * 1024; // 3.5 MB for KV/Blobs JSON persistence

export function saveUploadedMedia(input: {
  dataUrl: string;
}):
  | { ok: true; mediaUrl: string; mediaType: PostMediaType; bytes: number }
  | { ok: false; error: string; statusCode: number } {
  const match = input.dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return { ok: false, statusCode: 400, error: 'Invalid media payload. Please select a photo or video file.' };
  }

  const mime = match[1].toLowerCase();
  const base64Data = match[2];
  const meta = MIME_TO_EXT[mime];
  if (!meta) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Unsupported file format. Upload JPG, PNG, WebP, GIF, MP4, WebM, or MOV files.',
    };
  }

  const buffer = Buffer.from(base64Data, 'base64');
  const maxBytes = IS_SERVERLESS ? MAX_BYTES_SERVERLESS : MAX_BYTES_LOCAL;
  if (buffer.length === 0 || buffer.length > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '');
    return {
      ok: false,
      statusCode: 413,
      error: `Media file exceeds the ${mb} MB upload limit. Please compress or trim your file.`,
    };
  }

  if (IS_SERVERLESS) {
    // Inline data URL persists reliably inside Vercel KV / Upstash Redis / Netlify Blobs snapshots
    return {
      ok: true,
      mediaUrl: input.dataUrl,
      mediaType: meta.mediaType,
      bytes: buffer.length,
    };
  }

  try {
    if (!fs.existsSync(MEDIA_DIR)) {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
    }
    const fileId = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.${meta.ext}`;
    const targetPath = path.join(MEDIA_DIR, fileId);
    fs.writeFileSync(targetPath, buffer);
    return {
      ok: true,
      mediaUrl: `/api/social/media/${fileId}`,
      mediaType: meta.mediaType,
      bytes: buffer.length,
    };
  } catch (err) {
    console.error('Failed to write uploaded media to disk, using inline fallback:', err);
    return {
      ok: true,
      mediaUrl: input.dataUrl,
      mediaType: meta.mediaType,
      bytes: buffer.length,
    };
  }
}

export function resolveUploadedMediaPath(fileId: string): { filePath: string; contentType: string } | null {
  if (!/^[a-zA-Z0-9._-]+$/.test(fileId) || fileId.includes('..')) {
    return null;
  }
  const filePath = path.join(MEDIA_DIR, fileId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const ext = path.extname(fileId).toLowerCase();
  const contentType = EXT_TO_MIME[ext] || 'application/octet-stream';
  return { filePath, contentType };
}
