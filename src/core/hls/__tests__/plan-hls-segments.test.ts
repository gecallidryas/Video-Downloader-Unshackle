import { describe, expect, test } from 'vitest';
import { parseHlsManifest } from '../parse-hls-manifest';
import { planHlsSegments } from '../plan-hls-segments';

describe('planHlsSegments', () => {
  test('includes init segment byte range and media byte ranges', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/vod/prog.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="720@0"',
        '#EXTINF:5,',
        '#EXT-X-BYTERANGE:1000@720',
        'seg-1.m4s',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });

    const plan = planHlsSegments(manifest, { jobId: 'job-hls-ranges' });

    expect(plan.segments).toEqual([
      expect.objectContaining({
        id: 'hls-init-0',
        byteRange: { start: 0, end: 719 },
      }),
      expect.objectContaining({
        id: 'hls-segment-1',
        byteRange: { start: 720, end: 1719 },
      }),
    ]);
  });
});
