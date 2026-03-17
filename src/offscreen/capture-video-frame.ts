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
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

const DEFAULT_MAX_THUMBNAIL_WIDTH = 320;
const DEFAULT_MAX_THUMBNAIL_HEIGHT = 180;
const DEFAULT_THUMBNAIL_QUALITY = 0.72;

function fitWithinBounds(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : maxWidth;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : maxHeight;
  const scale = Math.min(1, maxWidth / safeWidth, maxHeight / safeHeight);

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
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
        const size = fitWithinBounds(
          video.videoWidth,
          video.videoHeight,
          options.maxWidth ?? DEFAULT_MAX_THUMBNAIL_WIDTH,
          options.maxHeight ?? DEFAULT_MAX_THUMBNAIL_HEIGHT,
        );
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          fail(new Error('Canvas 2D context unavailable'));
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL(
          mimeType,
          options.quality ?? DEFAULT_THUMBNAIL_QUALITY,
        );
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
