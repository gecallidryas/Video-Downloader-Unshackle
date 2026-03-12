import { describe, expect, test, vi } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { ensureNativeThumbnail } from '../native-thumbnail-service';
import type { NativeFfmpegClient } from '@/src/native/native-ffmpeg-client';

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: 'Thumbnail video',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    durationSec: 100,
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function nativeClient(): NativeFfmpegClient {
  return {
    ping: vi.fn(),
    exportMedia: vi.fn(),
    extractThumbnail: vi.fn().mockResolvedValue({
      candidateId: 'candidate-1',
      outputPath: 'C:\\thumbs\\candidate-1.jpg',
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,anBnLWJ5dGVz',
    }),
    extractPreviewClip: vi.fn(),
    cancelJob: vi.fn(),
    cleanupJob: vi.fn(),
  } as unknown as NativeFfmpegClient;
}

describe('thumbnail service browser fallback', () => {
  test('falls back to offscreen canvas capture when native client unavailable', async () => {
    const offscreenCapture = vi.fn().mockResolvedValue({
      ok: true,
      assetUrl: 'data:image/jpeg;base64,b2ZmY2FudmFz',
      mimeType: 'image/jpeg',
    });

    const result = await ensureNativeThumbnail(candidate(), {
      offscreenCapture,
    });

    expect(result).toEqual({
      assetUrl: 'data:image/jpeg;base64,b2ZmY2FudmFz',
      mimeType: 'image/jpeg',
      generated: true,
    });
    expect(offscreenCapture).toHaveBeenCalledWith({
      type: 'EXTRACT_THUMBNAIL',
      url: 'https://cdn.example.com/video.mp4',
      atSec: 10,
      format: 'jpeg',
    });
  });

  test('prefers native client over offscreen when both available', async () => {
    const client = nativeClient();
    const offscreenCapture = vi.fn();

    const result = await ensureNativeThumbnail(candidate(), {
      nativeClient: client,
      offscreenCapture,
    });

    expect(result).toEqual({
      assetUrl: 'data:image/jpeg;base64,anBnLWJ5dGVz',
      mimeType: 'image/jpeg',
      generated: true,
    });
    expect(client.extractThumbnail).toHaveBeenCalled();
    expect(offscreenCapture).not.toHaveBeenCalled();
  });

  test('throws when neither native nor offscreen available for non-static candidate', async () => {
    await expect(ensureNativeThumbnail(candidate(), {})).rejects.toThrow();
  });

  test('falls back to offscreen canvas capture for HLS protocol', async () => {
    const offscreenCapture = vi.fn().mockResolvedValue({
      ok: true,
      assetUrl: 'data:image/jpeg;base64,b2ZmY2FudmFz',
      mimeType: 'image/jpeg',
    });

    const result = await ensureNativeThumbnail(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      { offscreenCapture },
    );

    expect(result).toEqual({
      assetUrl: 'data:image/jpeg;base64,b2ZmY2FudmFz',
      mimeType: 'image/jpeg',
      generated: true,
    });
    expect(offscreenCapture).toHaveBeenCalledWith({
      type: 'EXTRACT_THUMBNAIL',
      url: 'https://cdn.example.com/master.m3u8',
      protocol: 'hls',
      atSec: 10,
      format: 'jpeg',
    });
  });

  test('still returns static thumbnail without any generation method', async () => {
    const result = await ensureNativeThumbnail(
      candidate({ thumbnails: { heroUrl: 'https://cdn.example.com/poster.jpg' } }),
      {},
    );

    expect(result).toEqual({
      assetUrl: 'https://cdn.example.com/poster.jpg',
      mimeType: 'image/jpeg',
      generated: false,
    });
  });
});
