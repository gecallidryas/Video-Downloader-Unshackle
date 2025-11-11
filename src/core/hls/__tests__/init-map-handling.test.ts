import { describe, expect, test } from 'vitest';
import { parseHlsManifest } from '../parse-hls-manifest';
import { planHlsSegments } from '../plan-hls-segments';

describe('HLS init map handling', () => {
  test('deduplicates init map when URI and byterange are unchanged', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example/hls/video.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="617@0"',
        '#EXTINF:6,',
        'seg-1.m4s',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="617@0"',
        '#EXTINF:6,',
        'seg-2.m4s',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });

    const plan = planHlsSegments(manifest, { jobId: 'job-init-dedupe' });

    expect(plan.segments.filter((segment) => segment.initSegment)).toHaveLength(1);
    expect(plan.segments.map((segment) => segment.id)).toEqual([
      'hls-init-0',
      'hls-segment-1',
      'hls-segment-2',
    ]);
  });

  test('reinserts init map when byterange changes', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example/hls/video.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="617@0"',
        '#EXTINF:6,',
        'seg-1.m4s',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="617@617"',
        '#EXTINF:6,',
        'seg-2.m4s',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });

    const plan = planHlsSegments(manifest, { jobId: 'job-init-change' });
    const initMaps = plan.segments.filter((segment) => segment.initSegment);

    expect(initMaps).toEqual([
      expect.objectContaining({ id: 'hls-init-0', byteRange: { start: 0, end: 616 } }),
      expect.objectContaining({ id: 'hls-init-1', byteRange: { start: 617, end: 1233 } }),
    ]);
    expect(plan.segments.map((segment) => segment.id)).toEqual([
      'hls-init-0',
      'hls-segment-1',
      'hls-init-1',
      'hls-segment-2',
    ]);
  });

  test('handles EXT-X-BYTERANGE media segments with offset tracking', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example/hls/media.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:6',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="617@0"',
        '#EXTINF:6,',
        '#EXT-X-BYTERANGE:100000@617',
        'video.mp4',
        '#EXTINF:6,',
        '#EXT-X-BYTERANGE:100000',
        'video.mp4',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });

    expect(manifest.segments[0]?.byteRange).toEqual({ start: 617, end: 100616 });
    expect(manifest.segments[1]?.byteRange).toEqual({
      start: 100617,
      end: 200616,
    });
  });
});
