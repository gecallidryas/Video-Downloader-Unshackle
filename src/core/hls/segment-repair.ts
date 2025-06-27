import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';

export interface SegmentRepairOptions {
  retryFailed?: number[];
  indexRange?: {
    start: number;
    end: number;
  };
  timeRange?: {
    startSec?: number;
    endSec?: number;
  };
  regexFilter?: RegExp | string;
}

function overlapsTimeRange(
  segmentStart: number,
  duration: number,
  startSec: number,
  endSec: number,
): boolean {
  const segmentEnd = segmentStart + duration;

  return segmentEnd > startSec && segmentStart < endSec;
}

export function selectSegmentsForRepair(
  segments: SegmentDescriptor[],
  options: SegmentRepairOptions = {},
): SegmentDescriptor[] {
  const failed = options.retryFailed ? new Set(options.retryFailed) : undefined;
  const regex =
    typeof options.regexFilter === 'string'
      ? new RegExp(options.regexFilter)
      : options.regexFilter;
  const timeStart = options.timeRange?.startSec ?? 0;
  const timeEnd = options.timeRange?.endSec ?? Infinity;

  let cumulativeStart = 0;
  const selected: SegmentDescriptor[] = [];

  for (const segment of segments) {
    const segmentStart = cumulativeStart;
    const duration = segment.durationSec ?? 0;
    cumulativeStart += duration;

    if (failed && !failed.has(segment.index)) {
      continue;
    }

    if (
      options.indexRange &&
      (segment.index < options.indexRange.start ||
        segment.index > options.indexRange.end)
    ) {
      continue;
    }

    if (
      options.timeRange &&
      !overlapsTimeRange(segmentStart, duration, timeStart, timeEnd)
    ) {
      continue;
    }

    regex && (regex.lastIndex = 0);

    if (regex && !regex.test(segment.url)) {
      continue;
    }

    selected.push(segment);
  }

  return selected;
}

export function expandSegmentRangeTemplate(template: string): string[] {
  const match = /\$\{range:(\d+)-(\d+)(?:,(\d+))?\}/.exec(template);

  if (!match) {
    return [template];
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  const pad = Number(match[3] ?? 0);
  const urls: string[] = [];
  const step = start <= end ? 1 : -1;

  for (let value = start; value !== end + step; value += step) {
    urls.push(
      template.replace(match[0], String(value).padStart(pad, '0')),
    );
  }

  return urls;
}
