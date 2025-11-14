import { afterEach, describe, expect, test, vi } from 'vitest';
import type { DownloadJob, SegmentPlan } from '@/video_downloader_types_skeleton';
import {
  createSegmentedExportPlan,
  exportBlobDownload,
  exportDirectDownload,
  joinSegmentsToBlob,
  rawSegmentOutputName,
} from '../downloads-export';

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

async function blobBytes(blob: Blob): Promise<number[]> {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }

      reject(new Error('Blob reader did not return an ArrayBuffer.'));
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Blob read failed.')));
    reader.readAsArrayBuffer(blob);
  });

  return [...new Uint8Array(buffer)];
}

describe('downloads export', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  test('joins segment bytes into a blob in order', async () => {
    const blob = joinSegmentsToBlob(
      [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])],
      'video/mp2t',
    );

    expect(blob.type).toBe('video/mp2t');
    await expect(blobBytes(blob)).resolves.toEqual([1, 2, 3, 4, 5]);
  });

  test('exports blob downloads through chrome downloads and revokes object URL later', async () => {
    vi.useFakeTimers();
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp2t' });
    const createObjectUrl = vi.fn().mockReturnValue('blob:raw-hls');
    const revokeObjectUrl = vi.fn();
    const download = vi.fn().mockResolvedValue(42);

    await expect(
      exportBlobDownload({
        blob,
        filename: 'raw.ts',
        mimeType: 'video/mp2t',
        saveAs: true,
        createObjectUrl,
        revokeObjectUrl,
        download,
      }),
    ).resolves.toMatchObject({
      fileName: 'raw.ts',
      mimeType: 'video/mp2t',
      outputUrl: 'blob:raw-hls',
      downloadId: 42,
      sizeBytes: 3,
    });

    expect(createObjectUrl).toHaveBeenCalledWith(blob);
    expect(download).toHaveBeenCalledWith({
      url: 'blob:raw-hls',
      filename: 'raw.ts',
      saveAs: true,
    });
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:raw-hls');
  });

  test('names raw HLS output as TS even when display name ends in MP4', () => {
    expect(
      rawSegmentOutputName({
        displayName: 'movie.mp4',
        protocol: 'hls',
      }),
    ).toBe('movie.ts');
  });

  test('names DASH raw segment output as M4S or BIN and never MP4', () => {
    expect(
      rawSegmentOutputName({
        displayName: 'movie.mp4',
        protocol: 'dash',
        extension: 'm4s',
      }),
    ).toBe('movie.m4s');
    expect(
      rawSegmentOutputName({
        displayName: 'movie.mp4',
        protocol: 'dash',
      }),
    ).toBe('movie.bin');
  });
});
