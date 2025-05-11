import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { clearPreviewCache, ensurePreviewClip } from '../native-preview-service';
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
