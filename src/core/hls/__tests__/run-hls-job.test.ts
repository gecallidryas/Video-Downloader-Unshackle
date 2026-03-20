import { describe, expect, test, vi } from 'vitest';
import mediaPlaylist from '@/src/fixtures/hls/media.m3u8?raw';
import protectedPlaylist from '@/src/fixtures/hls/protected.m3u8?raw';
import type { DownloadJob } from '@/video_downloader_types_skeleton';
import * as segmentScheduler from '@/src/core/download/segment-scheduler';
import { createIndexedDbFragmentStore } from '@/src/core/storage/indexeddb-fragment-store';
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
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

  test('streams segment export callbacks before final output while preserving plan order', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/video/720p/prog.m3u8',
      content: [
        '#EXTM3U',
        '#EXTINF:4,',
        'segment-1.ts',
        '#EXTINF:4,',
        'segment-2.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });
    const events: string[] = [];
    const first = deferred<Uint8Array>();
    const second = deferred<Uint8Array>();
    const outputPromise = runHlsJob({
      job: buildJob(),
      manifest,
      concurrency: 2,
      fetchSegment: vi.fn((segment) => {
        events.push(`fetch-${segment.index}`);
        return segment.index === 1 ? first.promise : second.promise;
      }),
      onSegmentExport: async (event) => {
        events.push(`export-${event.segment.index}`);
      },
      writeOutput: vi.fn().mockImplementation(async () => {
        events.push('write-output');
        return {
          fileName: 'streamed.ts',
          mimeType: 'video/mp2t',
        };
      }),
    });

    await vi.waitFor(() => expect(events).toEqual(['fetch-1', 'fetch-2']));
    second.resolve(new Uint8Array([2]));
    await Promise.resolve();
    expect(events).toEqual(['fetch-1', 'fetch-2']);
    first.resolve(new Uint8Array([1]));

    await expect(outputPromise).resolves.toMatchObject({ fileName: 'streamed.ts' });
    expect(events).toEqual(['fetch-1', 'fetch-2', 'export-1', 'export-2', 'write-output']);
  });

  test('serializes ordered segment export callbacks when concurrent workers finish while export is busy', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/video/prog.m3u8',
      content: [
        '#EXTM3U',
        '#EXTINF:4,',
        'segment-1.ts',
        '#EXTINF:4,',
        'segment-2.ts',
        '#EXTINF:4,',
        'segment-3.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });
    const events: string[] = [];
    const firstExport = deferred<void>();

    const outputPromise = runHlsJob({
      job: buildJob(),
      manifest,
      concurrency: 3,
      fetchSegment: vi.fn(async (segment) => new Uint8Array([segment.index])),
      onSegmentExport: async (event) => {
        events.push(`start-${event.segment.index}`);

        if (event.segment.index === 1) {
          await firstExport.promise;
        }

        events.push(`end-${event.segment.index}`);
      },
      writeOutput: vi.fn().mockResolvedValue({
        fileName: 'streamed.ts',
        mimeType: 'video/mp2t',
      }),
    });

    await vi.waitFor(() => expect(events).toEqual(['start-1']));
    await Promise.resolve();
    expect(events).toEqual(['start-1']);
    firstExport.resolve();

    await expect(outputPromise).resolves.toMatchObject({ fileName: 'streamed.ts' });
    expect(events).toEqual(['start-1', 'end-1', 'start-2', 'end-2', 'start-3', 'end-3']);
  });


  test('limits HLS output to the selected segment range while retaining init segments', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/video/720p/prog.m3u8',
      content: mediaPlaylist,
    });
    const onPlan = vi.fn();
    const spy = vi.spyOn(segmentScheduler, 'scheduleSegments').mockResolvedValue([
      new Uint8Array([2]),
      new Uint8Array([3]),
    ]);

    await runHlsJob({
      job: buildJob({ selection: { mode: 'custom', segmentRange: { start: 2, end: 3 } } }),
      manifest,
      fetchSegment: vi.fn(),
      writeOutput: vi.fn().mockResolvedValue({
        fileName: 'partial.ts',
        mimeType: 'video/mp2t',
      }),
      onPlan,
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        segments: [
          expect.objectContaining({ index: 0, initSegment: true }),
          expect.objectContaining({ index: 2 }),
          expect.objectContaining({ index: 3 }),
        ],
      }),
    );
    expect(onPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        segments: [
          expect.objectContaining({ index: 0 }),
          expect.objectContaining({ index: 2 }),
          expect.objectContaining({ index: 3 }),
        ],
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

  test('passes scheduler request context to fetchSegment', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/video/720p/prog.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="4@0"',
        '#EXTINF:6,',
        '#EXT-X-BYTERANGE:10@4',
        'seg.m4s',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });
    const requests: Array<{ headers: Record<string, string>; signal?: AbortSignal }> = [];

    await runHlsJob({
      job: buildJob(),
      manifest,
      fetchSegment: vi.fn(async (_segment, _plan, request) => {
        requests.push(request);
        return new Uint8Array([1]);
      }),
      writeOutput: vi.fn().mockResolvedValue({
        fileName: 'assembled-hls.mp4',
        mimeType: 'video/mp4',
      }),
      segmentTimeoutMs: 12_000,
    });

    expect(requests).toEqual([
      expect.objectContaining({ headers: { Range: 'bytes=0-3' } }),
      expect.objectContaining({ headers: { Range: 'bytes=4-13' } }),
    ]);
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
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

  test('wires a fragment storage backend into scheduleSegments on a normal run', async () => {
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
    });

    const passedStorage = spy.mock.calls[0]?.[0]?.storage;
    expect(passedStorage).toBeDefined();
    expect(typeof passedStorage?.createBucket).toBe('function');
    expect(typeof passedStorage?.listFragmentIndices).toBe('function');
    expect(typeof passedStorage?.writeFragment).toBe('function');
    spy.mockRestore();
  });

  test('persists fragments and skips already-stored fragments on restart', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/video/720p/prog.m3u8',
      content: mediaPlaylist,
    });
    const fragmentStore = createIndexedDbFragmentStore({ mode: 'memory' });
    const writeOutput = vi.fn(async (_plan, parts: Uint8Array[]) => ({
      fileName: 'assembled-hls.mp4',
      mimeType: 'video/mp4',
      sizeBytes: parts.length,
    }));

    const firstFetch = vi.fn(async (segment) => new Uint8Array([segment.index]));
    await runHlsJob({
      job: buildJob(),
      manifest,
      fragmentStore,
      fetchSegment: firstFetch,
      writeOutput,
    });

    expect(firstFetch).toHaveBeenCalledTimes(4);
    expect(await fragmentStore.listFragmentIndices('job-hls-1')).toEqual([0, 1, 2, 3]);

    const secondFetch = vi.fn(async (segment) => new Uint8Array([segment.index]));
    await runHlsJob({
      job: buildJob(),
      manifest,
      fragmentStore,
      fetchSegment: secondFetch,
      writeOutput,
    });

    expect(secondFetch).not.toHaveBeenCalled();
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
