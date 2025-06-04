import { describe, expect, test, vi } from 'vitest';
import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';
import { createInitSegmentCache } from '../init-segment-cache';
import { scheduleSegments } from '../segment-scheduler';

describe('InitSegmentCache', () => {
  test('returns cached data for the same URI and byte range', async () => {
    const cache = createInitSegmentCache();
    const fetcher = vi.fn().mockResolvedValue(new Uint8Array([0xde, 0xad]));

    const first = await cache.getOrFetch(
      { uri: 'https://cdn.example.com/init.mp4', byteRange: { start: 0, end: 9 } },
      fetcher,
    );
    const second = await cache.getOrFetch(
      { uri: 'https://cdn.example.com/init.mp4', byteRange: { start: 0, end: 9 } },
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  test('refetches when URI changes', async () => {
    const cache = createInitSegmentCache();
    const fetcher = vi.fn().mockResolvedValue(new Uint8Array([1]));

    await cache.getOrFetch({ uri: 'https://cdn.example.com/init-1.mp4' }, fetcher);
    await cache.getOrFetch({ uri: 'https://cdn.example.com/init-2.mp4' }, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('scheduler deduplicates duplicate init segment fetches', async () => {
    const initSegment: SegmentDescriptor = {
      id: 'init-0',
      index: 0,
      url: 'https://cdn.example.com/init.mp4',
      initSegment: true,
      byteRange: { start: 0, end: 99 },
    };
    const fetchSegment = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

    await expect(
      scheduleSegments({
        segments: [
          initSegment,
          { ...initSegment, id: 'init-1', index: 1 },
        ],
        concurrency: 2,
        fetchSegment,
      }),
    ).resolves.toEqual([new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])]);

    expect(fetchSegment).toHaveBeenCalledTimes(1);
  });

  test('scheduler caches fully recovered init segment data', async () => {
    vi.useFakeTimers();

    const initSegment: SegmentDescriptor = {
      id: 'init-0',
      index: 0,
      url: 'https://cdn.example.com/init.mp4',
      initSegment: true,
    };
    const fetchSegment = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('broken pipe'), {
          partialBytes: 2,
          partialData: new Uint8Array([1, 2]),
        }),
      )
      .mockResolvedValueOnce(new Uint8Array([3, 4]));

    const resultPromise = scheduleSegments({
      segments: [
        initSegment,
        { ...initSegment, id: 'init-1', index: 1 },
      ],
      fetchAttempts: 2,
      fetchSegment,
    });

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual([
      new Uint8Array([1, 2, 3, 4]),
      new Uint8Array([1, 2, 3, 4]),
    ]);
    expect(fetchSegment).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
