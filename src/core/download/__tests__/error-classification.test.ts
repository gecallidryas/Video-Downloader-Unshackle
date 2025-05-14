import { describe, expect, test, vi } from 'vitest';
import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';
import { scheduleSegments } from '../segment-scheduler';
import { isNonRetryableError, SegmentFetchError } from '../error-classification';

function segment(status: number): SegmentDescriptor {
  return {
    id: `segment-${status}`,
    index: 0,
    url: `https://cdn.example.com/${status}.ts`,
  };
}

describe('error-classification', () => {
  test.each([400, 401, 403, 404, 405, 410, 451])(
    '%i is non-retryable',
    (status) => {
      expect(isNonRetryableError(new SegmentFetchError(status, 'HTTP error'))).toBe(
        true,
      );
    },
  );

  test.each([500, 502, 503])('%i remains retryable', (status) => {
    expect(isNonRetryableError(new SegmentFetchError(status, 'Server error'))).toBe(
      false,
    );
  });

  test('network errors remain retryable', () => {
    expect(isNonRetryableError(new TypeError('Failed to fetch'))).toBe(false);
  });

  test('scheduler does not retry non-retryable segment fetch errors', async () => {
    const fetchSegment = vi.fn(async () => {
      throw new SegmentFetchError(404, 'Not Found');
    });

    await expect(
      scheduleSegments({
        segments: [segment(404)],
        fetchAttempts: 3,
        fetchSegment,
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(fetchSegment).toHaveBeenCalledTimes(1);
  });
});
