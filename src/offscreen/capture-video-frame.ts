// src/offscreen/capture-video-frame.ts
import { loadMediaObjectUrl, type LoadedMediaObjectUrl } from './load-media-object-url';

export interface CaptureFrameOptions {
  url: string;
  atSec: number;
  format: 'jpeg' | 'png' | 'webp';
  timeoutMs: number;
}

export function captureVideoFrame(options: CaptureFrameOptions): Promise<string> {
  const { url, atSec, format, timeoutMs } = options;
  const mimeType = `image/${format}`;

  return new Promise<string>((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    let loadedMedia: LoadedMediaObjectUrl | undefined;
    let settled = false;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Thumbnail capture timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      loadedMedia?.revoke();
    }

    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function succeed(dataUrl: string) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(dataUrl);
    }

    video.addEventListener('error', () => {
      fail(new Error(`Failed to load video: ${url}`));
    }, { once: true });

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(atSec, video.duration || atSec);
    }, { once: true });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          fail(new Error('Canvas 2D context unavailable'));
          return;
        }

        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL(mimeType, 0.85);
        succeed(dataUrl);
      } catch (error) {
        fail(error);
      }
    }, { once: true });

    void loadMediaObjectUrl(url)
      .then((media) => {
        if (settled) {
          media.revoke();
          return;
        }
        loadedMedia = media;
        video.src = media.objectUrl;
      })
      .catch(fail);
  });
}
