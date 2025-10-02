import { describe, expect, test } from 'vitest';
import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';
import { splitTimelineIntoBatchJobs } from '../batch-timeline';

function seg(index: number, options: { discontinuity?: boolean } = {}): SegmentDescriptor {
  return {
    id: `s${index}`,
    index,
    url: `https://cdn.example.com/seg-${index}.ts`,
    discontinuity: options.discontinuity,
  } as SegmentDescriptor;
}

describe('splitTimelineIntoBatchJobs', () => {
  test('returns one job when no discontinuities present', () => {
    const result = splitTimelineIntoBatchJobs({
      segments: [seg(0), seg(1), seg(2)],
      baseName: 'video',
      extension: 'mp4',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.outputName).toBe('video.mp4');
    expect(result[0]?.segments).toHaveLength(3);
  });

  test('splits into separate jobs per discontinuity group with numbered names', () => {
    const result = splitTimelineIntoBatchJobs({
      segments: [
        seg(0),
        seg(1),
        seg(2, { discontinuity: true }),
        seg(3),
        seg(4, { discontinuity: true }),
        seg(5),
      ],
      baseName: 'video',
      extension: 'mp4',
    });

    expect(result.map((job) => job.outputName)).toEqual([
      'video-part1.mp4',
      'video-part2.mp4',
      'video-part3.mp4',
    ]);
    expect(result.map((job) => job.segments.length)).toEqual([2, 2, 2]);
  });

  test('preserves segment ordering inside each part', () => {
    const result = splitTimelineIntoBatchJobs({
      segments: [seg(0), seg(1), seg(2, { discontinuity: true }), seg(3)],
      baseName: 'show',
      extension: 'mkv',
    });

    expect(result[0]?.segments.map((segment) => segment.index)).toEqual([0, 1]);
    expect(result[1]?.segments.map((segment) => segment.index)).toEqual([2, 3]);
  });
});
