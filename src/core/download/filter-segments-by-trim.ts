import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';

export function filterSegmentsByTrim(
  segments: SegmentDescriptor[],
  trim: { startSec?: number; endSec?: number } | undefined,
): SegmentDescriptor[] {
  if (!trim) return segments;

  const trimStart = trim.startSec ?? 0;
  const trimEnd = trim.endSec ?? Infinity;

  if (trimStart <= 0 && trimEnd === Infinity) return segments;

  let cumulativeStart = 0;
  const filtered: SegmentDescriptor[] = [];

  for (const segment of segments) {
    if (segment.initSegment) {
      filtered.push(segment);
      continue;
    }

    const segDuration = segment.durationSec ?? 0;
    const segEnd = cumulativeStart + segDuration;

    if (segEnd > trimStart && cumulativeStart < trimEnd) {
      filtered.push(segment);
    }

    cumulativeStart = segEnd;
  }

  return filtered;
}
