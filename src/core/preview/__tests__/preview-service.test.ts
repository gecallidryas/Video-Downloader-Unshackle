import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  clearPreviewCache,
  ensurePreviewClip,
  PreviewGenerationError,
} from '../native-preview-service';
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
      outputPath: 'C:\\previews\\candidate-1.webm',
      mimeType: 'video/webm',
      dataUrl: 'data:video/webm;base64,bmF0aXZl',
    }),
    cancelJob: vi.fn(),
    cleanupJob: vi.fn(),
  } as unknown as NativeFfmpegClient;
}

describe('preview service browser fallback', () => {
  beforeEach(() => {
    clearPreviewCache('candidate-1');
  });

  test('falls back to offscreen MediaRecorder when native client unavailable and protocol is direct', async () => {
    const offscreenRecord = vi.fn().mockResolvedValue({
      ok: true,
      assetUrl: 'data:video/webm;base64,b2Zmc2NyZWVu',
      mimeType: 'video/webm',
    });

    const result = await ensurePreviewClip(candidate(), { offscreenRecord });

    expect(offscreenRecord).toHaveBeenCalledWith({
      type: 'GENERATE_PREVIEW_CLIP',
      url: 'https://cdn.example.com/video.mp4',
      startSec: 10,
      durationSec: 3,
    });
    expect(result).toEqual({
      assetUrl: 'data:video/webm;base64,b2Zmc2NyZWVu',
      mimeType: 'video/webm',
      generated: true,
    });
  });

  test('prefers native client over offscreen when both available', async () => {
    const client = nativeClient();
    const offscreenRecord = vi.fn().mockResolvedValue({
      ok: true,
      assetUrl: 'data:video/webm;base64,b2Zmc2NyZWVu',
      mimeType: 'video/webm',
    });

    const result = await ensurePreviewClip(candidate(), {
      nativeClient: client,
      offscreenRecord,
    });

    expect(client.extractPreviewClip).toHaveBeenCalledTimes(1);
    expect(offscreenRecord).not.toHaveBeenCalled();
    expect(result.assetUrl).toBe('data:video/webm;base64,bmF0aXZl');
  });

  test('falls back to offscreen MediaRecorder when native messaging is unavailable', async () => {
    const client = nativeClient();
    vi.mocked(client.extractPreviewClip).mockRejectedValueOnce(
      new NativeFfmpegClientError(
        'NATIVE_UNAVAILABLE',
        'Native messaging API is unavailable.',
      ),
    );
    const offscreenRecord = vi.fn().mockResolvedValue({
      ok: true,
      assetUrl: 'data:video/webm;base64,b2Zmc2NyZWVu',
      mimeType: 'video/webm',
    });

    const result = await ensurePreviewClip(candidate(), {
      nativeClient: client,
      offscreenRecord,
    });

    expect(offscreenRecord).toHaveBeenCalledWith({
      type: 'GENERATE_PREVIEW_CLIP',
      url: 'https://cdn.example.com/video.mp4',
      startSec: 10,
      durationSec: 3,
    });
    expect(result).toEqual({
      assetUrl: 'data:video/webm;base64,b2Zmc2NyZWVu',
      mimeType: 'video/webm',
      generated: true,
    });
  });

  test('throws when neither native nor offscreen available', async () => {
    await expect(ensurePreviewClip(candidate(), {})).rejects.toThrow();
  });

  test('skips offscreen fallback for HLS protocol', async () => {
    const offscreenRecord = vi.fn().mockResolvedValue({
      ok: true,
      assetUrl: 'data:video/webm;base64,b2Zmc2NyZWVu',
      mimeType: 'video/webm',
    });

    await expect(
      ensurePreviewClip(candidate({ protocol: 'hls' }), { offscreenRecord }),
    ).rejects.toThrow();
    expect(offscreenRecord).not.toHaveBeenCalled();
  });

  test('returns typed native-required error for HLS when native preview is unavailable', async () => {
    const client = nativeClient();
    vi.mocked(client.extractPreviewClip).mockRejectedValueOnce(
      new NativeFfmpegClientError(
        'NATIVE_UNAVAILABLE',
        'Native messaging API is unavailable.',
      ),
    );

    await expect(
      ensurePreviewClip(
        candidate({
          protocol: 'hls',
          sourceUrl: undefined,
          manifestUrl: 'https://cdn.example.com/master.m3u8',
        }),
        { nativeClient: client, offscreenRecord: vi.fn() },
      ),
    ).rejects.toMatchObject({
      name: 'PreviewGenerationError',
      code: 'NATIVE_REQUIRED',
    } satisfies Partial<PreviewGenerationError>);
  });

  test('rejects offscreen failure responses with a typed error', async () => {
    await expect(
      ensurePreviewClip(candidate(), {
        offscreenRecord: vi.fn().mockResolvedValue({
          ok: false,
          assetUrl: '',
          mimeType: '',
        }),
      }),
    ).rejects.toMatchObject({
      name: 'PreviewGenerationError',
      code: 'OFFSCREEN_FAILED',
      message: 'Offscreen MediaRecorder did not return a preview asset.',
    } satisfies Partial<PreviewGenerationError>);
  });

  test('rejects offscreen responses with missing asset URLs', async () => {
    await expect(
      ensurePreviewClip(candidate(), {
        offscreenRecord: vi.fn().mockResolvedValue({
          ok: true,
          assetUrl: '',
          mimeType: 'video/webm',
        }),
      }),
    ).rejects.toMatchObject({
      name: 'PreviewGenerationError',
      code: 'OFFSCREEN_FAILED',
    } satisfies Partial<PreviewGenerationError>);
  });

  test('rejects protected media before native or offscreen preview generation', async () => {
    const client = nativeClient();
    const offscreenRecord = vi.fn();

    await expect(
      ensurePreviewClip(
        candidate({ status: 'protected', protection: { kind: 'drm', drmSystems: ['widevine'] } }),
        { nativeClient: client, offscreenRecord },
      ),
    ).rejects.toMatchObject({
      name: 'PreviewGenerationError',
      code: 'PROTECTED_MEDIA',
    } satisfies Partial<PreviewGenerationError>);
    expect(client.extractPreviewClip).not.toHaveBeenCalled();
    expect(offscreenRecord).not.toHaveBeenCalled();
  });

  test('caches offscreen-generated preview', async () => {
    const offscreenRecord = vi.fn().mockResolvedValue({
      ok: true,
      assetUrl: 'data:video/webm;base64,b2Zmc2NyZWVu',
      mimeType: 'video/webm',
    });

    const first = await ensurePreviewClip(candidate(), { offscreenRecord });
    const second = await ensurePreviewClip(candidate(), { offscreenRecord });

    expect(offscreenRecord).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });
});
