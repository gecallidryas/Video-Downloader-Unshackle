import { describe, expect, test, vi } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { clearPreviewCache, ensurePreviewClip, getCachedPreview } from '../native-preview-service';
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
    displayName: 'Preview video',
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
    extractThumbnail: vi.fn(),
    extractPreviewClip: vi.fn().mockResolvedValue({
      candidateId: 'candidate-1',
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\previews\\candidate-1.webm',
      mimeType: 'video/webm',
      dataUrl: 'data:video/webm;base64,d2VibS1ieXRlcw==',
    }),
    cancelJob: vi.fn(),
    cleanupJob: vi.fn(),
  } as unknown as NativeFfmpegClient;
}

describe('native preview service', () => {
  test('generates and caches a preview clip using candidate duration defaults', async () => {
    const client = nativeClient();
    clearPreviewCache('candidate-1');

    const first = await ensurePreviewClip(candidate(), { nativeClient: client });
    const second = await ensurePreviewClip(candidate(), { nativeClient: client });

    expect(client.extractPreviewClip).toHaveBeenCalledTimes(1);
    expect(client.extractPreviewClip).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      inputUrl: 'https://cdn.example.com/video.mp4',
      startSec: 10,
      durationSec: 10,
      format: 'webm',
    });
    expect(first).toEqual({
      assetUrl: 'data:video/webm;base64,d2VibS1ieXRlcw==',
      mimeType: 'video/webm',
      generated: true,
    });
    expect(second).toEqual(first);
    expect(getCachedPreview('candidate-1')).toEqual(first);
  });

  test('returns native preview metadata when the helper omits inline asset data', async () => {
    const client = nativeClient();
    vi.mocked(client.extractPreviewClip).mockResolvedValueOnce({
      candidateId: 'candidate-1',
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\previews\\candidate-1.webm',
      mimeType: 'video/webm',
    } as Awaited<ReturnType<NativeFfmpegClient['extractPreviewClip']>>);
    clearPreviewCache('candidate-1');

    await expect(ensurePreviewClip(candidate(), { nativeClient: client })).resolves.toMatchObject({
      assetUrl: '',
      mimeType: 'video/webm',
      generated: true,
      nativeAssetRef: {
        outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\previews\\candidate-1.webm',
        mimeType: 'video/webm',
      },
    });
  });

  test('uses requested format settings in the preview cache key', async () => {
    const client = nativeClient();
    clearPreviewCache('candidate-1');

    await ensurePreviewClip(candidate(), { nativeClient: client, format: 'mp4', startSec: 2, durationSec: 4 });
    await ensurePreviewClip(candidate(), { nativeClient: client, format: 'gif', startSec: 2, durationSec: 4 });

    expect(client.extractPreviewClip).toHaveBeenCalledTimes(2);
  });

  test('passes captured headers to native preview extraction', async () => {
    const client = nativeClient();
    clearPreviewCache('candidate-1');

    await ensurePreviewClip(candidate(), {
      nativeClient: client,
      headers: {
        referer: 'https://example.com/watch',
        origin: 'https://example.com',
      },
    });

    expect(client.extractPreviewClip).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      inputUrl: 'https://cdn.example.com/video.mp4',
      startSec: 10,
      durationSec: 10,
      format: 'webm',
      headers: {
        referer: 'https://example.com/watch',
        origin: 'https://example.com',
      },
    });
  });

  test('does not request previews for protected media', async () => {
    const client = nativeClient();

    await expect(
      ensurePreviewClip(
        candidate({ status: 'protected', protection: { kind: 'drm', drmSystems: ['widevine'] } }),
        { nativeClient: client },
      ),
    ).rejects.toThrow(/Protected media/);
    expect(client.extractPreviewClip).not.toHaveBeenCalled();
  });

  test('records HLS preview clips through the offscreen browser fallback', async () => {
    clearPreviewCache('candidate-hls');
    const offscreenRecord = vi.fn().mockResolvedValue({
      ok: true,
      assetUrl: 'data:video/webm;base64,aGxz',
      mimeType: 'video/webm',
    });

    await expect(
      ensurePreviewClip(
        candidate({
          id: 'candidate-hls',
          protocol: 'hls',
          sourceUrl: undefined,
          manifestUrl: 'https://cdn.example.com/master.m3u8',
        }),
        { offscreenRecord },
      ),
    ).resolves.toEqual({
      assetUrl: 'data:video/webm;base64,aGxz',
      mimeType: 'video/webm',
      generated: true,
    });
    expect(offscreenRecord).toHaveBeenCalledWith({
      type: 'GENERATE_PREVIEW_CLIP',
      url: 'https://cdn.example.com/master.m3u8',
      protocol: 'hls',
      startSec: 10,
      durationSec: 10,
    });
  });
});
