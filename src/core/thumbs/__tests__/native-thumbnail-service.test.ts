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
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\thumbs\\candidate-1.jpg',
      mimeType: 'image/jpeg',
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
      assetUrl: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\thumbs\\candidate-1.jpg',
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

    await expect(
      ensureNativeThumbnail(
        candidate({ status: 'protected', protection: { kind: 'drm', drmSystems: ['widevine'] } }),
        { nativeClient: client },
      ),
    ).rejects.toThrow(/Protected media/);
    expect(client.extractThumbnail).not.toHaveBeenCalled();
  });
});
