import { describe, expect, test, vi } from 'vitest';
import type { DownloadJob, SegmentPlan } from '@/video_downloader_types_skeleton';
import { exportDirectDownload, createSegmentedExportPlan } from '../downloads-export';

function job(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: 'job-1',
    candidateId: 'candidate-1',
    tabId: 1,
    phase: 'queued',
    createdAt: 1,
    updatedAt: 1,
    selection: { mode: 'best' },
    progressPct: 0,
    bytesDownloaded: 0,
    ...overrides,
  };
}

function plan(overrides: Partial<SegmentPlan> = {}): SegmentPlan {
  return {
    jobId: 'job-1',
    candidateId: 'candidate-1',
    protocol: 'hls',
    variantId: 'v1',
    selectedAudioTrackIds: [],
    selectedSubtitleTrackIds: [],
    segments: [{ id: 's0', index: 0, url: 'https://cdn.example.com/s0.ts' }],
    ...overrides,
  };
}

describe('downloads export', () => {
  test('direct downloads call chrome.downloads.download', async () => {
    const download = vi.fn().mockResolvedValue(123);

    await expect(
      exportDirectDownload({
        url: 'https://cdn.example.com/video.mp4',
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        saveAs: true,
        download,
      }),
    ).resolves.toEqual({
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      outputUrl: 'https://cdn.example.com/video.mp4',
      downloadId: 123,
    });
    expect(download).toHaveBeenCalledWith({
      url: 'https://cdn.example.com/video.mp4',
      filename: 'video.mp4',
      saveAs: true,
    });
  });

  test('segmented jobs produce an OPFS export plan for large known jobs', () => {
    expect(
      createSegmentedExportPlan({
        job: job({ bytesTotal: 2_000_000_000 }),
        plan: plan(),
        outputName: 'stream.mp4',
        estimatedBytes: 2_000_000_000,
        durationSec: 3600,
        memoryCeilingBytes: 500_000_000,
        opfsAvailable: true,
      }),
    ).toMatchObject({
      mode: 'opfs',
      splitOutput: true,
      outputName: 'stream.mp4',
      segmentPlan: expect.objectContaining({ protocol: 'hls' }),
    });
  });
});
