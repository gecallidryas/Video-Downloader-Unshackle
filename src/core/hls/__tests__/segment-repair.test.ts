import { describe, expect, test } from 'vitest';
import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';
import {
  expandSegmentRangeTemplate,
  selectSegmentsForRepair,
} from '../segment-repair';

function makeSegments(count: number): SegmentDescriptor[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `s${index}`,
    index,
    url: `https://cdn.example/${index}.ts`,
    durationSec: 6,
  }));
}

describe('HLS segment repair controls', () => {
  test('retries only failed segments', () => {
    const selected = selectSegmentsForRepair(makeSegments(10), {
      retryFailed: [2, 5, 8],
    });

    expect(selected.map((segment) => segment.index)).toEqual([2, 5, 8]);
  });

  test('selects segments by inclusive index range', () => {
    const selected = selectSegmentsForRepair(makeSegments(20), {
      indexRange: { start: 5, end: 10 },
    });

    expect(selected).toHaveLength(6);
    expect(selected[0]?.index).toBe(5);
    expect(selected[5]?.index).toBe(10);
  });

  test('selects segments by overlapping time range', () => {
    const selected = selectSegmentsForRepair(makeSegments(5), {
      timeRange: { startSec: 8, endSec: 20 },
    });

    expect(selected.map((segment) => segment.index)).toEqual([1, 2, 3]);
  });

  test('selects segments by URL regex filter', () => {
    const selected = selectSegmentsForRepair(makeSegments(12), {
      regexFilter: /\/1[01]\.ts$/,
    });

    expect(selected.map((segment) => segment.index)).toEqual([10, 11]);
  });

  test('combines failed, index, time, and regex filters', () => {
    const selected = selectSegmentsForRepair(makeSegments(12), {
      retryFailed: [2, 5, 8, 10],
      indexRange: { start: 5, end: 10 },
      timeRange: { startSec: 30, endSec: 66 },
      regexFilter: /(?:8|10)\.ts$/,
    });

    expect(selected.map((segment) => segment.index)).toEqual([8, 10]);
  });
});

describe('HLS range expansion', () => {
  test('expands padded range operator in manual URL templates', () => {
    expect(
      expandSegmentRangeTemplate('https://cdn.example/seg-${range:7-9,3}.ts'),
    ).toEqual([
      'https://cdn.example/seg-007.ts',
      'https://cdn.example/seg-008.ts',
      'https://cdn.example/seg-009.ts',
    ]);
  });

  test('returns template unchanged when no range operator present', () => {
    expect(expandSegmentRangeTemplate('https://cdn.example/seg-1.ts')).toEqual([
      'https://cdn.example/seg-1.ts',
    ]);
  });

  test('rejects ranges exceeding safety limit', () => {
    expect(() =>
      expandSegmentRangeTemplate('https://cdn.example/seg-${range:0-99999,1}.ts'),
    ).toThrow(/max 10000/);
  });
});
