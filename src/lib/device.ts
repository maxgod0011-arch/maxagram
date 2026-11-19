import type { DeviceSignals } from '../../shared/types';

function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return navigator.platform || 'Desktop';
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//i.test(ua)) return 'Microsoft Edge';
  if (/OPR\//i.test(ua)) return 'Opera';
  if (/Firefox\//i.test(ua)) return 'Mozilla Firefox';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Google Chrome';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Apple Safari';
  return 'Web Browser';
}

function collectCanvasSignature(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    ctx.textBaseline = 'top';
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 240, 48);
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('MAXAGRAM-DEVICE-SIG-V1', 8, 12);
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(200, 24, 14, 0, Math.PI * 2);
    ctx.stroke();
    return canvas.toDataURL().slice(-96);
  } catch {
    return 'canvas-blocked';
  }
}

function collectWebGLSignature(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (!gl) return 'no-webgl';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const vendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '');
      const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
      return `${vendor}|${renderer}`;
    }
    return String(gl.getParameter(gl.RENDERER) || 'webgl');
  } catch {
    return 'webgl-blocked';
  }
}

async function sha256Hex(input: string): Promise<string> {
  if (window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(input);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic fallback hash when subtle crypto is unavailable on non-HTTPS local IP
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}${(
    (h1 ^ h2) >>>
    0
  )
    .toString(16)
    .padStart(8, '0')}`;
}

let cachedSignalsPromise: Promise<DeviceSignals> | null = null;

/**
 * Computes deterministic hardware and environment signals that remain stable
 * across page reloads and cleared browser storage so the backend can enforce
 * true one-device registration without relying solely on cookies or localStorage.
 */
export function getDeviceSignals(): Promise<DeviceSignals> {
  if (cachedSignalsPromise) return cachedSignalsPromise;

  cachedSignalsPromise = (async () => {
    const platform = detectPlatform();
    const browser = detectBrowser();
    const screenStr = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const language = navigator.language || 'en-US';
    const cores = navigator.hardwareConcurrency || 0;
    const touchPoints = navigator.maxTouchPoints || 0;
    const canvasSig = collectCanvasSignature();
    const glSig = collectWebGLSignature();

    const rawMaterial = [
      platform,
      browser,
      screenStr,
      timezone,
      language,
      String(cores),
      String(touchPoints),
      canvasSig,
      glSig,
    ].join('::');

    const clientHash = await sha256Hex(rawMaterial);

    return {
      clientHash,
      platform,
      browser,
      screen: screenStr,
      timezone,
      language,
    };
  })();

  return cachedSignalsPromise;
}
