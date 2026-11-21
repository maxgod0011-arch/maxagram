import type { PostMediaType } from '../../shared/types';
import { uploadSocialMedia } from './api';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read selected file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

function compressImageToDataUrl(file: File, maxDimension: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(readFileAsDataUrl(file));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outputMime = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(outputMime, 0.86);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Selected image file could not be decoded.'));
    };
    img.src = objectUrl;
  });
}

function captureVideoPosterDataUrl(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    const finish = (result: string | undefined) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    const timeout = window.setTimeout(() => finish(undefined), 3500);

    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.4, Number.isFinite(video.duration) ? video.duration / 4 : 0);
      } catch {
        window.clearTimeout(timeout);
        finish(undefined);
      }
    };

    video.onseeked = () => {
      window.clearTimeout(timeout);
      try {
        const maxDim = 960;
        let width = video.videoWidth || 640;
        let height = video.videoHeight || 360;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(undefined);
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        finish(canvas.toDataURL('image/jpeg', 0.8));
      } catch {
        finish(undefined);
      }
    };

    video.onerror = () => {
      window.clearTimeout(timeout);
      finish(undefined);
    };

    video.src = objectUrl;
  });
}

export async function prepareAndUploadMediaFile(
  file: File,
  options?: { maxDimension?: number; allowVideo?: boolean }
): Promise<{
  mediaUrl: string;
  mediaType: PostMediaType;
  posterUrl?: string;
}> {
  const allowVideo = options?.allowVideo !== false;
  const maxDimension = options?.maxDimension || 1400;
  const mime = file.type.toLowerCase();

  if (IMAGE_MIMES.has(mime)) {
    const dataUrl =
      mime === 'image/gif'
        ? await readFileAsDataUrl(file)
        : await compressImageToDataUrl(file, maxDimension);
    const uploaded = await uploadSocialMedia(dataUrl);
    return {
      mediaUrl: uploaded.mediaUrl,
      mediaType: 'image',
    };
  }

  if (allowVideo && VIDEO_MIMES.has(mime)) {
    if (file.size > 12 * 1024 * 1024) {
      throw new Error('Video must be 12 MB or smaller. Please trim or compress the clip.');
    }
    const [videoDataUrl, posterDataUrl] = await Promise.all([
      readFileAsDataUrl(file),
      captureVideoPosterDataUrl(file),
    ]);

    const uploadedVideo = await uploadSocialMedia(videoDataUrl);
    let posterUrl: string | undefined;
    if (posterDataUrl) {
      try {
        const uploadedPoster = await uploadSocialMedia(posterDataUrl);
        posterUrl = uploadedPoster.mediaUrl;
      } catch {
        posterUrl = undefined;
      }
    }

    return {
      mediaUrl: uploadedVideo.mediaUrl,
      mediaType: 'video',
      posterUrl,
    };
  }

  throw new Error(
    allowVideo
      ? 'Unsupported file type. Choose JPG, PNG, WebP, GIF, MP4, WebM, or MOV.'
      : 'Please choose a JPG, PNG, WebP, or GIF image.'
  );
}
