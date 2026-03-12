// src/offscreen/capture-video-frame.ts
import type { StreamProtocol } from '@/video_downloader_types_skeleton';
import { loadVideoSource, type DirectLoadMode, type LoadedVideoSource } from './load-video-source';

export interface CaptureFrameOptions {
  url: string;
  protocol?: StreamProtocol;
  atSec: number;
  format: 'jpeg' | 'png' | 'webp';
  timeoutMs: number;
  directMode?: DirectLoadMode;
}

export function captureVideoFrame(options: CaptureFrameOptions): Promise<string> {
  const { url, atSec, format, timeoutMs } = options;
  const mimeType = `image/${format}`;

  return new Promise<string>((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    let loadedMedia: LoadedVideoSource | undefined;
    let sourceReady = false;
    let pendingLoadedMetadata = false;
    let pendingSeeked = false;
    let settled = false;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Thumbnail capture timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      loadedMedia?.cleanup();
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

    function handleLoadedMetadata() {
      if (!sourceReady) {
        pendingLoadedMetadata = true;
        return;
      }
      const duration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : atSec;
      const targetTime = Math.min(atSec, duration);

      if (Math.abs(video.currentTime - targetTime) < 0.001) {
        captureWhenFrameReady();
        return;
      }

      video.currentTime = targetTime;
    }

    function captureWhenFrameReady() {
      if (video.readyState >= 2) {
        requestAnimationFrame(handleSeeked);
        return;
      }

      video.addEventListener('loadeddata', handleSeeked, { once: true });
    }

    function handleSeeked() {
      if (!sourceReady) {
        pendingSeeked = true;
        return;
      }
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
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });

    video.addEventListener('seeked', handleSeeked, { once: true });

    const loadSource: Promise<LoadedVideoSource> = loadVideoSource(video, {
      url,
      protocol: options.protocol,
      directMode: options.directMode ?? 'element-src',
    });

    void loadSource
      .then((media) => {
        if (settled) {
          media.cleanup();
          return;
        }
        loadedMedia = media;
        sourceReady = true;
        if (pendingLoadedMetadata) {
          handleLoadedMetadata();
        }
        if (pendingSeeked) {
          handleSeeked();
        }
      })
      .catch(fail);
  });
}
