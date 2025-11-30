import { describe, expect, test, vi } from 'vitest';
import type { DownloadJob, MediaCandidate } from '@/video_downloader_types_skeleton';
import { runBrowserDirectTrimJob } from '../browser-direct-trim-runner';

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-direct-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: 'Direct video.mp4',
    sourceUrl: 'https://cdn.example.com/video.mp4',
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

function job(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: 'job-direct-1',
    candidateId: 'candidate-direct-1',
    tabId: 7,
    phase: 'queued',
    createdAt: 1,
    updatedAt: 1,
    selection: {
      mode: 'best',
      outputKind: 'webm',
      trim: { startSec: 10, endSec: 20 },
    },
    progressPct: 0,
    bytesDownloaded: 0,
    ...overrides,
  };
}

describe('browser direct trim runner', () => {
  test('records selected direct trim duration and downloads a WebM clip', async () => {
    const offscreenRecord = vi.fn().mockResolvedValue({
      ok: true,
      assetUrl: 'data:video/webm;base64,Y2xpcA==',
      mimeType: 'video/webm',
    });
    const clipBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/webm' });
    const fetchDataUrl = vi.fn().mockResolvedValue(clipBlob);
    const download = vi.fn().mockResolvedValue(101);

    await expect(
      runBrowserDirectTrimJob({
        candidate: candidate(),
        job: job({ selection: { mode: 'best', outputKind: 'webm', saveAs: true, trim: { startSec: 10, endSec: 20 } } }),
        offscreenRecord,
        fetchDataUrl,
        createObjectUrl: vi.fn().mockReturnValue('blob:webm-trim'),
        revokeObjectUrl: vi.fn(),
        download,
      }),
    ).resolves.toMatchObject({
      fileName: 'Direct video.trim.webm',
      mimeType: 'video/webm',
      outputUrl: 'blob:webm-trim',
      downloadId: 101,
      sizeBytes: 3,
      notes: ['Browser-recorded WebM clip; not an original-quality stream copy.'],
    });

    expect(offscreenRecord).toHaveBeenCalledWith({
      type: 'GENERATE_PREVIEW_CLIP',
      url: 'https://cdn.example.com/video.mp4',
      startSec: 10,
      durationSec: 10,
      maxDurationSec: 600,
    });
    expect(fetchDataUrl).toHaveBeenCalledWith('data:video/webm;base64,Y2xpcA==');
    expect(download).toHaveBeenCalledWith({
      url: 'blob:webm-trim',
      filename: 'Direct video.trim.webm',
      saveAs: true,
    });
  });

  test('refuses missing source URL', async () => {
    await expect(
      runBrowserDirectTrimJob({
        candidate: candidate({ sourceUrl: undefined }),
        job: job(),
        offscreenRecord: vi.fn(),
      }),
    ).rejects.toThrow('Browser direct trim requires a source URL.');
  });

  test('refuses protected media', async () => {
    await expect(
      runBrowserDirectTrimJob({
        candidate: candidate({
          status: 'protected',
          protection: { kind: 'drm', drmSystems: ['widevine'] },
        }),
        job: job(),
        offscreenRecord: vi.fn(),
      }),
    ).rejects.toThrow('Protected media cannot be browser-recorded.');
  });

  test('caps browser-recorded trim duration', async () => {
    await expect(
      runBrowserDirectTrimJob({
        candidate: candidate(),
        job: job({ selection: { mode: 'best', outputKind: 'webm', trim: { startSec: 0, endSec: 601 } } }),
        offscreenRecord: vi.fn(),
      }),
    ).rejects.toThrow('Browser-recorded trim clips are limited to 600 seconds.');
  });
});
