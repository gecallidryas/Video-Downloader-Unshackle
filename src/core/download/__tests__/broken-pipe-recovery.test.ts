import { describe, expect, test, vi } from 'vitest';
import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';
import { scheduleSegments } from '../segment-scheduler';

function segment(): SegmentDescriptor {
  return {
    id: 'segment-0',
    index: 0,
    url: 'https://cdn.example.com/video.ts',
  };
}

describe('broken-pipe recovery', () => {
  test('retries with a Range header and joins partial segment data', async () => {
    vi.useFakeTimers();

    const fetchSegment = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('broken pipe'), {
          partialBytes: 3,
          partialData: new Uint8Array([1, 2, 3]),
        }),
      )
      .mockResolvedValueOnce(new Uint8Array([4, 5]));

    const resultPromise = scheduleSegments({
      segments: [segment()],
      fetchAttempts: 2,
      fetchSegment,
    });

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual([new Uint8Array([1, 2, 3, 4, 5])]);
    expect(fetchSegment).toHaveBeenCalledTimes(2);
    expect(fetchSegment.mock.calls[1]?.[1].headers).toEqual({
      Range: 'bytes=3-',
    });

    vi.useRealTimers();
  });

  test('does not resume from missing partial bytes', async () => {
    vi.useFakeTimers();

    const fetchSegment = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('broken pipe'), {
          partialBytes: 3,
        }),
      )
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3, 4, 5]));

    const resultPromise = scheduleSegments({
      segments: [segment()],
      fetchAttempts: 2,
      fetchSegment,
    });

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual([new Uint8Array([1, 2, 3, 4, 5])]);
    expect(fetchSegment.mock.calls[1]?.[1].headers).toEqual({});

    vi.useRealTimers();
  });
});
