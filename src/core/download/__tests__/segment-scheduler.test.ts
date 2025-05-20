import { describe, expect, test, vi } from 'vitest';
import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';
import { scheduleSegments } from '../segment-scheduler';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function segment(
  index: number,
  url = `https://cdn.example.com/seg-${index}.m4s`,
): SegmentDescriptor {
  return {
    id: `segment-${index}`,
    index,
    url,
  };
}

describe('scheduleSegments', () => {
  test('honors global concurrency, per-host limits, and returns parts in segment order', async () => {
    const gates = [deferred<Uint8Array>(), deferred<Uint8Array>(), deferred<Uint8Array>()];
    const activeByHost = new Map<string, number>();
    const maxActiveByHost = new Map<string, number>();
    let active = 0;
    let maxActive = 0;
    const started: number[] = [];

    const resultPromise = scheduleSegments({
      segments: [
        segment(0, 'https://a.example.com/0.m4s'),
        segment(1, 'https://a.example.com/1.m4s'),
        segment(2, 'https://b.example.com/2.m4s'),
      ],
      concurrency: 3,
      maxConcurrentPerHost: 1,
      fetchSegment: async (item) => {
        const host = new URL(item.url).hostname;
        active += 1;
        activeByHost.set(host, (activeByHost.get(host) ?? 0) + 1);
        maxActive = Math.max(maxActive, active);
        maxActiveByHost.set(host, Math.max(maxActiveByHost.get(host) ?? 0, activeByHost.get(host) ?? 0));
        started.push(item.index);
        const bytes = await gates[item.index].promise;
        active -= 1;
        activeByHost.set(host, (activeByHost.get(host) ?? 1) - 1);
        return bytes;
      },
    });

    await vi.waitFor(() => expect(started).toEqual([0, 2]));
    gates[0].resolve(new Uint8Array([0]));
    await vi.waitFor(() => expect(started).toEqual([0, 2, 1]));
    gates[2].resolve(new Uint8Array([2]));
    gates[1].resolve(new Uint8Array([1]));

    await expect(resultPromise).resolves.toEqual([
      new Uint8Array([0]),
      new Uint8Array([1]),
      new Uint8Array([2]),
    ]);
    expect(maxActive).toBe(2);
    expect(maxActiveByHost.get('a.example.com')).toBe(1);
  });

  test('retries failed segments, applies byte-range headers, and reports progress', async () => {
    vi.useFakeTimers();

    const progress = vi.fn();
    const fetchSegment = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(new Uint8Array([7]));

    const resultPromise = scheduleSegments({
      segments: [
        {
          ...segment(0),
          byteRange: { start: 10, end: 19 },
        },
      ],
      fetchAttempts: 2,
      onProgress: progress,
      fetchSegment,
    });

    // Advance timers to resolve the backoff delay between retries
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual([new Uint8Array([7])]);

    expect(fetchSegment).toHaveBeenCalledTimes(2);
    expect(fetchSegment.mock.calls[0][1]).toMatchObject({
      headers: { Range: 'bytes=10-19' },
    });
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ downloaded: 1, failed: 0, total: 1 }),
    );

    vi.useRealTimers();
  });

  test('retries use exponential backoff with increasing delays', async () => {
    vi.useFakeTimers();

    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    const setTimeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
        if (ms && ms >= 400 && ms < 30_000) {
          delays.push(ms);
        }
        return originalSetTimeout(fn as (...args: unknown[]) => void, 0, ...args);
      });

    const fetchSegment = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValueOnce(new Uint8Array([42]));

    const resultPromise = scheduleSegments({
      segments: [segment(0)],
      fetchAttempts: 3,
      fetchSegment,
    });

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual([new Uint8Array([42])]);
    expect(fetchSegment).toHaveBeenCalledTimes(3);
    expect(delays).toHaveLength(2);
    expect(delays[1]).toBeGreaterThan(delays[0]);

    setTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  test('supports cancellation and skips resumed segments already present in storage', async () => {
    const controller = new AbortController();
    const storage = {
      createBucket: vi.fn(),
      listFragmentIndices: vi.fn().mockResolvedValue([0]),
      writeFragment: vi.fn(),
    };
    const fetchSegment = vi.fn().mockImplementation(async () => {
      controller.abort();
      return new Uint8Array([1]);
    });

    await expect(
      scheduleSegments({
        jobId: 'job-1',
        segments: [segment(0), segment(1), segment(2)],
        storage,
        fetchSegment,
        signal: controller.signal,
      }),
    ).rejects.toThrow('Segment download cancelled.');

    expect(storage.createBucket).toHaveBeenCalledWith('job-1');
    expect(fetchSegment).toHaveBeenCalledTimes(1);
    expect(fetchSegment.mock.calls[0][0]).toMatchObject({ index: 1 });
    expect(storage.writeFragment).toHaveBeenCalledWith('job-1', 1, new Uint8Array([1]));
  });

  test('aborts a segment fetch after the configured timeout', async () => {
    vi.useFakeTimers();

    const controller = new AbortController();
    const fetchSegment = vi.fn(
      async (_item: SegmentDescriptor, request) =>
        new Promise<Uint8Array>((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => {
            reject(request.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    const resultPromise = scheduleSegments({
      segments: [segment(0)],
      fetchSegment,
      segmentTimeoutMs: 100,
      signal: controller.signal,
    });
    const rejection = expect(resultPromise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(100);

    expect(fetchSegment.mock.calls[0]?.[1].signal?.aborted).toBe(true);
    await rejection;

    controller.abort();
    vi.useRealTimers();
  });
});
