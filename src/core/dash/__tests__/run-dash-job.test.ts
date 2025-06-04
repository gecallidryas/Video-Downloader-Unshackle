import { describe, expect, test, vi } from 'vitest';
import clearMpd from '@/src/fixtures/dash/clear.mpd?raw';
import protectedMpd from '@/src/fixtures/dash/protected.mpd?raw';
import type { DownloadJob } from '@/video_downloader_types_skeleton';
import * as segmentScheduler from '@/src/core/download/segment-scheduler';
import { parseMpd } from '../parse-mpd';
import { planDashSegments } from '../plan-dash-segments';
import { runDashJob } from '../run-dash-job';

function buildJob(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: 'job-dash-1',
    candidateId: 'candidate-dash-1',
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

describe('DASH planning and execution', () => {
  test('generates ordered init and media segments for clear DASH representations', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/clear.mpd',
      content: clearMpd,
    });

    const plan = planDashSegments(manifest, {
      jobId: 'job-dash-1',
      selection: { mode: 'best', variantId: 'video-720' },
    });

    expect(plan).toMatchObject({
      jobId: 'job-dash-1',
      candidateId: manifest.id,
      protocol: 'dash',
      variantId: 'video-720',
    });
    expect(plan.segments).toEqual([
      expect.objectContaining({
        id: 'dash-init-video-720',
        index: 0,
        initSegment: true,
        url: 'https://cdn.example.com/dash/video/init-video-720.mp4',
      }),
      expect.objectContaining({
        id: 'dash-segment-video-720-1',
        index: 1,
        url: 'https://cdn.example.com/dash/video/video-720-1.m4s',
        durationSec: 5,
      }),
      expect.objectContaining({
        id: 'dash-segment-video-720-2',
        index: 2,
        url: 'https://cdn.example.com/dash/video/video-720-2.m4s',
        durationSec: 5,
      }),
      expect.objectContaining({
        id: 'dash-segment-video-720-3',
        index: 3,
        url: 'https://cdn.example.com/dash/video/video-720-3.m4s',
        durationSec: 5,
      }),
    ]);
  });

  test('runs clear DASH segment work through injectable segment and output boundaries', async () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/clear.mpd',
      content: clearMpd,
    });
    const fetchSegment = vi
      .fn()
      .mockResolvedValueOnce(new Uint8Array([0]))
      .mockResolvedValueOnce(new Uint8Array([1]))
      .mockResolvedValueOnce(new Uint8Array([2]))
      .mockResolvedValueOnce(new Uint8Array([3]));
    const writeOutput = vi.fn().mockResolvedValue({
      fileName: 'assembled-dash.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 4,
    });

    const output = await runDashJob({
      job: buildJob({ selection: { mode: 'custom', variantId: 'video-720' } }),
      manifest,
      fetchSegment,
      writeOutput,
    });

    expect(fetchSegment.mock.calls.map(([segment]) => segment.url)).toEqual([
      'https://cdn.example.com/dash/video/init-video-720.mp4',
      'https://cdn.example.com/dash/video/video-720-1.m4s',
      'https://cdn.example.com/dash/video/video-720-2.m4s',
      'https://cdn.example.com/dash/video/video-720-3.m4s',
    ]);
    expect(writeOutput).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-dash-1' }),
      [new Uint8Array([0]), new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])],
    );
    expect(output).toEqual({
      fileName: 'assembled-dash.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 4,
    });
  });

  test('rejects protected DASH manifests before segment fetching', async () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/protected.mpd',
      content: protectedMpd,
    });
    const fetchSegment = vi.fn();

    await expect(
      runDashJob({
        job: buildJob(),
        manifest,
        fetchSegment,
        writeOutput: vi.fn(),
      }),
    ).rejects.toThrow('Protected DASH manifests are blocked from the generic DASH runner.');
    expect(fetchSegment).not.toHaveBeenCalled();
  });

  test('passes concurrency and maxConcurrentPerHost through to scheduleSegments', async () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/clear.mpd',
      content: clearMpd,
    });
    const fetchSegment = vi
      .fn()
      .mockResolvedValue(new Uint8Array([0]));
    const writeOutput = vi.fn().mockResolvedValue({
      fileName: 'out.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1,
    });

    const spy = vi.spyOn(segmentScheduler, 'scheduleSegments').mockResolvedValue([
      new Uint8Array([0]),
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
    ]);

    try {
      await runDashJob({
        job: buildJob({ selection: { mode: 'custom', variantId: 'video-720' } }),
        manifest,
        fetchSegment,
        writeOutput,
        concurrency: 5,
        maxConcurrentPerHost: 3,
      });

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          concurrency: 5,
          maxConcurrentPerHost: 3,
        }),
      );
    } finally {
      spy.mockRestore();
    }
  });

  test('passes segmentTimeoutMs through to scheduleSegments', async () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/clear.mpd',
      content: clearMpd,
    });
    const spy = vi.spyOn(segmentScheduler, 'scheduleSegments').mockResolvedValue([
      new Uint8Array([0]),
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
    ]);

    try {
      await runDashJob({
        job: buildJob({ selection: { mode: 'custom', variantId: 'video-720' } }),
        manifest,
        fetchSegment: vi.fn(),
        writeOutput: vi.fn().mockResolvedValue({
          fileName: 'out.mp4',
          mimeType: 'video/mp4',
        }),
        segmentTimeoutMs: 12_000,
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ segmentTimeoutMs: 12_000 }),
      );
    } finally {
      spy.mockRestore();
    }
  });

  test('defaults concurrency to 1 when not specified', async () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/clear.mpd',
      content: clearMpd,
    });
    const fetchSegment = vi
      .fn()
      .mockResolvedValue(new Uint8Array([0]));
    const writeOutput = vi.fn().mockResolvedValue({
      fileName: 'out.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1,
    });

    const spy = vi.spyOn(segmentScheduler, 'scheduleSegments').mockResolvedValue([
      new Uint8Array([0]),
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
    ]);

    try {
      await runDashJob({
        job: buildJob({ selection: { mode: 'custom', variantId: 'video-720' } }),
        manifest,
        fetchSegment,
        writeOutput,
      });

      expect(spy).toHaveBeenCalledOnce();
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
    } finally {
      spy.mockRestore();
    }
  });
});
