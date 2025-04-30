// src/offscreen/capture-video-frame.ts

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
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Thumbnail capture timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
    }

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error(`Failed to load video: ${url}`));
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
          cleanup();
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }

        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL(mimeType, 0.85);
        cleanup();
        resolve(dataUrl);
      } catch (error) {
        cleanup();
        reject(error);
      }
    }, { once: true });

    video.src = url;
  });
}
