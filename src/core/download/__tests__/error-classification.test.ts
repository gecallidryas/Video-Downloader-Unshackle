import { describe, expect, test, vi } from 'vitest';
import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';
import { scheduleSegments } from '../segment-scheduler';
import {
  isNonRetryableError,
  parseRetryAfter,
  retryAfterFromError,
  SegmentFetchError,
} from '../error-classification';

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

  describe('parseRetryAfter', () => {
    test('parses delta-seconds form into milliseconds', () => {
      expect(parseRetryAfter('120')).toBe(120_000);
      expect(parseRetryAfter('0')).toBe(0);
    });

    test('parses HTTP-date form relative to now', () => {
      const now = Date.UTC(2026, 0, 1, 0, 0, 0);
      const future = new Date(now + 30_000).toUTCString();

      expect(parseRetryAfter(future, now)).toBe(30_000);
    });

    test('clamps past HTTP-date values to zero', () => {
      const now = Date.UTC(2026, 0, 1, 0, 0, 0);
      const past = new Date(now - 30_000).toUTCString();

      expect(parseRetryAfter(past, now)).toBe(0);
    });

    test('returns undefined when the header is missing or malformed', () => {
      expect(parseRetryAfter(null)).toBeUndefined();
      expect(parseRetryAfter(undefined)).toBeUndefined();
      expect(parseRetryAfter('')).toBeUndefined();
      expect(parseRetryAfter('soon')).toBeUndefined();
    });
  });

  test('retryAfterFromError surfaces the captured delay', () => {
    expect(retryAfterFromError(new SegmentFetchError(429, 'Too Many Requests', 5_000))).toBe(
      5_000,
    );
    expect(retryAfterFromError(new SegmentFetchError(503, 'Unavailable'))).toBeUndefined();
    expect(retryAfterFromError(new Error('boom'))).toBeUndefined();
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
