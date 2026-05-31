import { describe, expect, test } from 'vitest';
import { deriveDownloadedRanges } from '../derive-downloaded-ranges';
import type { JobSegmentStatus } from '@/video_downloader_types_skeleton';

function segment(
  index: number,
  status: JobSegmentStatus['status'],
  durationSec?: number,
): JobSegmentStatus {
  return { index, status, ...(durationSec !== undefined ? { durationSec } : {}) };
}

describe('deriveDownloadedRanges', () => {
  test('returns empty ranges for no segments', () => {
    expect(deriveDownloadedRanges(undefined)).toEqual({ ranges: [], totalDurationSec: 0 });
    expect(deriveDownloadedRanges([])).toEqual({ ranges: [], totalDurationSec: 0 });
  });

  test('uses the fallback total when no segment durations are known', () => {
    const segments = [segment(0, 'done'), segment(1, 'done')];
    expect(deriveDownloadedRanges(segments, 120)).toEqual({
      ranges: [],
      totalDurationSec: 120,
    });
  });

  test('maps a contiguous run of done segments to a single cumulative range', () => {
    const segments = [
      segment(0, 'done', 4),
      segment(1, 'done', 6),
      segment(2, 'pending', 5),
    ];

    expect(deriveDownloadedRanges(segments)).toEqual({
      ranges: [{ start: 0, end: 10 }],
      totalDurationSec: 15,
    });
  });

  test('splits into multiple ranges across gaps and sorts by index', () => {
    const segments = [
      segment(2, 'done', 5),
      segment(0, 'done', 4),
      segment(1, 'failed', 6),
      segment(3, 'done', 5),
    ];

    expect(deriveDownloadedRanges(segments)).toEqual({
      ranges: [
        { start: 0, end: 4 },
        { start: 10, end: 20 },
      ],
      totalDurationSec: 20,
    });
  });

  test('prefers a positive fallback total over the summed duration', () => {
    const segments = [segment(0, 'done', 4), segment(1, 'pending', 6)];

    expect(deriveDownloadedRanges(segments, 100)).toEqual({
      ranges: [{ start: 0, end: 4 }],
      totalDurationSec: 100,
    });
  });

  test('treats a trailing done run as a closed range', () => {
    const segments = [segment(0, 'pending', 4), segment(1, 'done', 6)];

    expect(deriveDownloadedRanges(segments)).toEqual({
      ranges: [{ start: 4, end: 10 }],
      totalDurationSec: 10,
    });
  });
});
