import { describe, expect, test } from 'vitest';
import { parseHlsManifest } from '../parse-hls-manifest';
import { groupByDiscontinuity, planHlsSegments } from '../plan-hls-segments';

describe('discontinuity handling', () => {
  test('groups segments by discontinuity boundaries', () => {
    const segments = [
      { index: 0, discontinuity: false, durationSec: 6 },
      { index: 1, discontinuity: false, durationSec: 6 },
      { index: 2, discontinuity: true, durationSec: 6 },
      { index: 3, discontinuity: false, durationSec: 6 },
      { index: 4, discontinuity: true, durationSec: 6 },
      { index: 5, discontinuity: false, durationSec: 6 },
    ];

    const groups = groupByDiscontinuity(segments);

    expect(groups).toHaveLength(3);
    expect(groups[0]?.segments.map((segment) => segment.index)).toEqual([0, 1]);
    expect(groups[1]?.segments.map((segment) => segment.index)).toEqual([2, 3]);
    expect(groups[2]?.segments.map((segment) => segment.index)).toEqual([4, 5]);
  });

  test('skip-ads policy keeps the longest continuous timeline', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/vod/disco.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:6',
        '#EXTINF:6,',
        'content-1.ts',
        '#EXTINF:6,',
        'content-2.ts',
        '#EXT-X-DISCONTINUITY',
        '#EXTINF:6,',
        'ad.ts',
        '#EXT-X-DISCONTINUITY',
        '#EXTINF:6,',
        'content-3.ts',
        '#EXTINF:6,',
        'content-4.ts',
        '#EXTINF:6,',
        'content-5.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });

    const plan = planHlsSegments(manifest, {
      jobId: 'job-discontinuity',
      discontinuityPolicy: 'skip-ads',
    });

    expect(plan.segments.map((segment) => segment.url)).toEqual([
      'https://cdn.example.com/hls/vod/content-3.ts',
      'https://cdn.example.com/hls/vod/content-4.ts',
      'https://cdn.example.com/hls/vod/content-5.ts',
    ]);
  });
});
