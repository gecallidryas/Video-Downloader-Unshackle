import { describe, expect, test } from 'vitest';
import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';
import { filterSegmentsByTrim } from '../filter-segments-by-trim';

function makeSegment(index: number, durationSec: number, init = false): SegmentDescriptor {
  return {
    id: init ? `init-${index}` : `seg-${index}`,
    index,
    url: `https://cdn.example.com/${init ? 'init' : `seg-${index}`}.m4s`,
    trackType: 'video',
    durationSec,
    ...(init ? { initSegment: true } : {}),
  };
}

describe('filterSegmentsByTrim', () => {
  const fiveSegments: SegmentDescriptor[] = [
    makeSegment(0, 6),
    makeSegment(1, 6),
    makeSegment(2, 6),
    makeSegment(3, 6),
    makeSegment(4, 6),
  ];

  test('returns all segments when trim is undefined', () => {
    const result = filterSegmentsByTrim(fiveSegments, undefined);
    expect(result).toBe(fiveSegments);
  });

  test('returns all segments when trim has no effective bounds', () => {
    const result = filterSegmentsByTrim(fiveSegments, {});
    expect(result).toBe(fiveSegments);
  });

  test('returns all segments when trim startSec=0 and endSec=Infinity', () => {
    const result = filterSegmentsByTrim(fiveSegments, { startSec: 0, endSec: Infinity });
    expect(result).toBe(fiveSegments);
  });

  test('filters segments by trim range [8, 20]', () => {
    // 5 segments of 6s each: [0-6), [6-12), [12-18), [18-24), [24-30)
    // Trim [8, 20] overlaps segments 1 (6-12), 2 (12-18), 3 (18-24)
    const result = filterSegmentsByTrim(fiveSegments, { startSec: 8, endSec: 20 });
    expect(result.map((s) => s.id)).toEqual(['seg-1', 'seg-2', 'seg-3']);
  });

  test('filters with only startSec specified', () => {
    // startSec=20, no endSec => includes segments overlapping [20, Infinity)
    // Segments: [0-6), [6-12), [12-18), [18-24), [24-30)
    // Overlaps: seg-3 (18-24) and seg-4 (24-30)
    const result = filterSegmentsByTrim(fiveSegments, { startSec: 20 });
    expect(result.map((s) => s.id)).toEqual(['seg-3', 'seg-4']);
  });

  test('filters with only endSec specified', () => {
    // no startSec, endSec=10 => includes segments overlapping [0, 10)
    // Segments: [0-6), [6-12), [12-18), [18-24), [24-30)
    // Overlaps: seg-0 (0-6) and seg-1 (6-12)
    const result = filterSegmentsByTrim(fiveSegments, { endSec: 10 });
    expect(result.map((s) => s.id)).toEqual(['seg-0', 'seg-1']);
  });

  test('always includes init segments', () => {
    const withInit: SegmentDescriptor[] = [
      makeSegment(0, 0, true),
      ...fiveSegments,
    ];
    const result = filterSegmentsByTrim(withInit, { startSec: 20, endSec: 25 });
    expect(result.map((s) => s.id)).toEqual(['init-0', 'seg-3', 'seg-4']);
  });

  test('returns only init segment when no media segments overlap', () => {
    const withInit: SegmentDescriptor[] = [
      makeSegment(0, 0, true),
      makeSegment(1, 5),
      makeSegment(2, 5),
    ];
    // Total duration is 10s, trim starts at 20
    const result = filterSegmentsByTrim(withInit, { startSec: 20, endSec: 25 });
    expect(result.map((s) => s.id)).toEqual(['init-0']);
  });

  test('handles segments with no durationSec (treated as 0)', () => {
    const noDuration: SegmentDescriptor[] = [
      { id: 'seg-0', index: 0, url: 'a.m4s', trackType: 'video' },
      { id: 'seg-1', index: 1, url: 'b.m4s', trackType: 'video' },
    ];
    // All segments have 0 duration, so cumulativeStart stays 0
    // segEnd = 0, trimStart = 5 => segEnd(0) > trimStart(5) is false => excluded
    const result = filterSegmentsByTrim(noDuration, { startSec: 5 });
    expect(result).toEqual([]);
  });

  test('returns empty array when no segments match and no init', () => {
    const result = filterSegmentsByTrim(fiveSegments, { startSec: 100, endSec: 200 });
    expect(result).toEqual([]);
  });
});
