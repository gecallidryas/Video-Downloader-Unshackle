import type { JobSegmentStatus } from '@/video_downloader_types_skeleton';

export interface DownloadedRange {
  start: number;
  end: number;
}

export interface DerivedDownloadedRegions {
  ranges: DownloadedRange[];
  totalDurationSec: number;
}

function resolveTotal(summedSec: number, fallbackTotalSec?: number): number {
  if (fallbackTotalSec && fallbackTotalSec > 0) {
    return fallbackTotalSec;
  }
  return summedSec;
}

// Map a job's per-segment status list to contiguous downloaded time ranges by
// accumulating each segment's duration. A "downloaded range" is a maximal run
// of consecutive `done` segments. Returns empty ranges when no per-segment
// duration is known (we never invent a timeline we cannot measure).
export function deriveDownloadedRanges(
  segments: JobSegmentStatus[] | undefined,
  fallbackTotalSec?: number,
): DerivedDownloadedRegions {
  if (!segments || segments.length === 0) {
    return { ranges: [], totalDurationSec: resolveTotal(0, fallbackTotalSec) };
  }

  const ordered = [...segments].sort((a, b) => a.index - b.index);
  const haveDurations = ordered.some(
    (segment) => typeof segment.durationSec === 'number' && segment.durationSec > 0,
  );

  if (!haveDurations) {
    return { ranges: [], totalDurationSec: resolveTotal(0, fallbackTotalSec) };
  }

  const ranges: DownloadedRange[] = [];
  let cursor = 0;
  let runStart: number | null = null;
  let runEnd = 0;

  for (const segment of ordered) {
    const duration =
      typeof segment.durationSec === 'number' && segment.durationSec > 0
        ? segment.durationSec
        : 0;
    const start = cursor;
    const end = cursor + duration;

    if (segment.status === 'done') {
      if (runStart === null) {
        runStart = start;
      }
      runEnd = end;
    } else if (runStart !== null) {
      ranges.push({ start: runStart, end: runEnd });
      runStart = null;
    }

    cursor = end;
  }

  if (runStart !== null) {
    ranges.push({ start: runStart, end: runEnd });
  }

  return { ranges, totalDurationSec: resolveTotal(cursor, fallbackTotalSec) };
}
