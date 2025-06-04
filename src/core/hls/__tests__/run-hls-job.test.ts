import { describe, expect, test, vi } from 'vitest';
import mediaPlaylist from '@/src/fixtures/hls/media.m3u8?raw';
import protectedPlaylist from '@/src/fixtures/hls/protected.m3u8?raw';
import type { DownloadJob } from '@/video_downloader_types_skeleton';
import * as segmentScheduler from '@/src/core/download/segment-scheduler';
import { parseHlsManifest } from '../parse-hls-manifest';
import { planHlsSegments } from '../plan-hls-segments';
import { runHlsJob } from '../run-hls-job';

function buildJob(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: 'job-hls-1',
    candidateId: 'candidate-hls-1',
    tabId: 7,
    phase: 'queued',
    createdAt: 100,
    updatedAt: 100,
    selection: { mode: 'best' },
    progressPct: 0,
    bytesDownloaded: 0,
    ...overrides,
  };
}

describe('HLS planning and execution', () => {
  test('plans ordered segment work for clear HLS media playlists', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/video/720p/prog.m3u8',
      content: mediaPlaylist,
    });

    const plan = planHlsSegments(manifest, { jobId: 'job-hls-1' });

    expect(plan).toMatchObject({
      jobId: 'job-hls-1',
      candidateId: manifest.id,
      protocol: 'hls',
      variantId: 'media-playlist',
    });
    expect(plan.segments).toEqual([
      expect.objectContaining({
        id: 'hls-init-0',
        index: 0,
        initSegment: true,
        url: 'https://cdn.example.com/hls/video/720p/init.mp4',
      }),
      expect.objectContaining({
        id: 'hls-segment-1',
        index: 1,
        url: 'https://cdn.example.com/hls/video/720p/segment-0001.m4s',
        durationSec: 5,
      }),
      expect.objectContaining({
        id: 'hls-segment-2',
        index: 2,
        url: 'https://cdn.example.com/hls/video/720p/segment-0002.m4s',
        durationSec: 5,
      }),
      expect.objectContaining({
        id: 'hls-segment-3',
        index: 3,
        url: 'https://cdn.example.com/hls/video/720p/segment-0003.m4s',
        durationSec: 4,
      }),
    ]);
  });

  test('runs clear HLS segment work through injectable segment and output boundaries', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/video/720p/prog.m3u8',
      content: mediaPlaylist,
    });
    const fetchSegment = vi
      .fn()
      .mockResolvedValueOnce(new Uint8Array([0]))
      .mockResolvedValueOnce(new Uint8Array([1]))
      .mockResolvedValueOnce(new Uint8Array([2]))
      .mockResolvedValueOnce(new Uint8Array([3]));
    const writeOutput = vi.fn().mockResolvedValue({
      fileName: 'assembled-hls.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 4,
    });

    const output = await runHlsJob({
      job: buildJob(),
      manifest,
      fetchSegment,
      writeOutput,
    });

    expect(fetchSegment.mock.calls.map(([segment]) => segment.url)).toEqual([
      'https://cdn.example.com/hls/video/720p/init.mp4',
      'https://cdn.example.com/hls/video/720p/segment-0001.m4s',
      'https://cdn.example.com/hls/video/720p/segment-0002.m4s',
      'https://cdn.example.com/hls/video/720p/segment-0003.m4s',
    ]);
    expect(writeOutput).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-hls-1' }),
      [new Uint8Array([0]), new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])],
    );
    expect(output).toEqual({
      fileName: 'assembled-hls.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 4,
    });
  });

  test('passes concurrency and maxConcurrentPerHost through to scheduleSegments', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/video/720p/prog.m3u8',
      content: mediaPlaylist,
    });
    const spy = vi.spyOn(segmentScheduler, 'scheduleSegments').mockResolvedValue([
      new Uint8Array([0]),
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
    ]);
    const writeOutput = vi.fn().mockResolvedValue({
      fileName: 'assembled-hls.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 4,
    });

    await runHlsJob({
      job: buildJob(),
      manifest,
      fetchSegment: vi.fn(),
      writeOutput,
      concurrency: 5,
      maxConcurrentPerHost: 3,
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 5,
        maxConcurrentPerHost: 3,
      }),
    );
    spy.mockRestore();
  });

  test('passes segmentTimeoutMs through to scheduleSegments', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/video/720p/prog.m3u8',
      content: mediaPlaylist,
    });
    const spy = vi.spyOn(segmentScheduler, 'scheduleSegments').mockResolvedValue([
      new Uint8Array([0]),
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
    ]);

    await runHlsJob({
      job: buildJob(),
      manifest,
      fetchSegment: vi.fn(),
      writeOutput: vi.fn().mockResolvedValue({
        fileName: 'assembled-hls.mp4',
        mimeType: 'video/mp4',
      }),
      segmentTimeoutMs: 12_000,
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ segmentTimeoutMs: 12_000 }),
    );
    spy.mockRestore();
  });

  test('adds live HLS telemetry to progress events', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/live.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:6',
        '#EXT-X-MEDIA-SEQUENCE:42',
        '#EXTINF:6,',
        'live-42.ts',
      ].join('\n'),
    });
    const onProgress = vi.fn();
    const spy = vi
      .spyOn(segmentScheduler, 'scheduleSegments')
      .mockImplementation(async (options) => {
        options.onProgress?.({ downloaded: 0, failed: 0, total: 1 });
        return [new Uint8Array([1])];
      });

    await runHlsJob({
      job: buildJob(),
      manifest,
      fetchSegment: vi.fn(),
      writeOutput: vi.fn().mockResolvedValue({
        fileName: 'live.mp4',
        mimeType: 'video/mp4',
      }),
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        liveHlsTelemetry: {
          noNewSegmentRetries: 0,
          lastSequence: 42,
          state: 'live',
          totalRefreshes: 1,
        },
      }),
    );
    spy.mockRestore();
  });

  test('defaults concurrency to 1 when not specified', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/video/720p/prog.m3u8',
      content: mediaPlaylist,
    });
    const spy = vi.spyOn(segmentScheduler, 'scheduleSegments').mockResolvedValue([
      new Uint8Array([0]),
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
    ]);
    const writeOutput = vi.fn().mockResolvedValue({
      fileName: 'assembled-hls.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 4,
    });

    await runHlsJob({
      job: buildJob(),
      manifest,
      fetchSegment: vi.fn(),
      writeOutput,
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 1,
      }),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.not.objectContaining({
        maxConcurrentPerHost: expect.anything(),
      }),
    );
    spy.mockRestore();
  });

  test('rejects protected HLS manifests before segment fetching', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/protected.m3u8',
      content: protectedPlaylist,
    });
    const fetchSegment = vi.fn();

    await expect(
      runHlsJob({
        job: buildJob(),
        manifest,
        fetchSegment,
        writeOutput: vi.fn(),
      }),
    ).rejects.toThrow('Protected HLS manifests are blocked from the generic HLS runner.');
    expect(fetchSegment).not.toHaveBeenCalled();
  });
});
