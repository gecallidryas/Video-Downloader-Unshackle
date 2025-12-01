import { describe, expect, test, vi } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  ensureNativeThumbnail,
  ThumbnailGenerationError,
} from '../native-thumbnail-service';
import {
  NativeFfmpegClientError,
  type NativeFfmpegClient,
} from '@/src/native/native-ffmpeg-client';

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
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\thumbs\\candidate-1.jpg',
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,anBnLWJ5dGVz',
    }),
    extractPreviewClip: vi.fn(),
    cancelJob: vi.fn(),
    cleanupJob: vi.fn(),
  } as unknown as NativeFfmpegClient;
}

describe('native thumbnail service', () => {
  test('returns an existing static thumbnail without native extraction', async () => {
    const client = nativeClient();

    await expect(
      ensureNativeThumbnail(candidate({ thumbnails: { heroUrl: 'https://cdn.example.com/poster.jpg' } }), {
        nativeClient: client,
      }),
    ).resolves.toEqual({
      assetUrl: 'https://cdn.example.com/poster.jpg',
      mimeType: 'image/jpeg',
      generated: false,
    });
    expect(client.extractThumbnail).not.toHaveBeenCalled();
  });

  test('requests a native thumbnail when no static thumbnail exists', async () => {
    const client = nativeClient();

    await expect(ensureNativeThumbnail(candidate(), { nativeClient: client })).resolves.toEqual({
      assetUrl: 'data:image/jpeg;base64,anBnLWJ5dGVz',
      mimeType: 'image/jpeg',
      generated: true,
    });
    expect(client.extractThumbnail).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      inputUrl: 'https://cdn.example.com/video.mp4',
      atSec: 10,
      format: 'jpg',
    });
  });

  test('does not request thumbnails for protected media', async () => {
    const client = nativeClient();
    const offscreenCapture = vi.fn();

    await expect(
      ensureNativeThumbnail(
        candidate({ status: 'protected', protection: { kind: 'drm', drmSystems: ['widevine'] } }),
        { nativeClient: client, offscreenCapture },
      ),
    ).rejects.toThrow(/Protected media/);
    expect(client.extractThumbnail).not.toHaveBeenCalled();
    expect(offscreenCapture).not.toHaveBeenCalled();
  });

  test('rejects generated thumbnails without extension-safe asset data', async () => {
    const client = nativeClient();
    vi.mocked(client.extractThumbnail).mockResolvedValueOnce({
      candidateId: 'candidate-1',
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\thumbs\\candidate-1.jpg',
      mimeType: 'image/jpeg',
    });

    await expect(ensureNativeThumbnail(candidate(), { nativeClient: client })).rejects.toThrow(
      /extension-safe thumbnail asset/i,
    );
  });

  test('falls back to offscreen direct frame capture when native thumbnail is unavailable', async () => {
    const client = nativeClient();
    vi.mocked(client.extractThumbnail).mockRejectedValueOnce(
      new NativeFfmpegClientError(
        'NATIVE_UNAVAILABLE',
        'Native messaging API is unavailable.',
      ),
    );
    const offscreenCapture = vi.fn().mockResolvedValue({
      ok: true,
      assetUrl: 'data:image/jpeg;base64,b2Zmc2NyZWVu',
      mimeType: 'image/jpeg',
    });

    await expect(
      ensureNativeThumbnail(candidate(), { nativeClient: client, offscreenCapture }),
    ).resolves.toEqual({
      assetUrl: 'data:image/jpeg;base64,b2Zmc2NyZWVu',
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

  test('returns typed native-required error for HLS thumbnails without static assets', async () => {
    const client = nativeClient();
    vi.mocked(client.extractThumbnail).mockRejectedValueOnce(
      new NativeFfmpegClientError(
        'NATIVE_UNAVAILABLE',
        'Native messaging API is unavailable.',
      ),
    );

    await expect(
      ensureNativeThumbnail(
        candidate({
          protocol: 'hls',
          sourceUrl: undefined,
          manifestUrl: 'https://cdn.example.com/master.m3u8',
        }),
        { nativeClient: client, offscreenCapture: vi.fn() },
      ),
    ).rejects.toMatchObject({
      name: 'ThumbnailGenerationError',
      code: 'NATIVE_REQUIRED',
    } satisfies Partial<ThumbnailGenerationError>);
  });

  test('surfaces offscreen capture failures with a thumbnail-specific message', async () => {
    const offscreenCapture = vi.fn().mockResolvedValue({
      ok: false,
      assetUrl: '',
      mimeType: '',
    });

    await expect(
      ensureNativeThumbnail(candidate(), { offscreenCapture }),
    ).rejects.toMatchObject({
      name: 'ThumbnailGenerationError',
      code: 'OFFSCREEN_FAILED',
      message: 'Offscreen thumbnail capture did not return an asset.',
    } satisfies Partial<ThumbnailGenerationError>);
  });
});
