import { describe, expect, test } from 'vitest';
import { parseHlsManifest, type ParsedHlsManifest } from '../parse-hls-manifest';
import { planHlsSegments } from '../plan-hls-segments';

describe('planHlsSegments', () => {
  test('applies default quality policy when no explicit variant is selected', () => {
    const manifest: ParsedHlsManifest = {
      id: 'policy-media',
      protocol: 'hls',
      sourceUrl: 'https://cdn.example.com/hls/vod/policy.m3u8',
      playlistKind: 'media',
      variants: [
        { id: 'v360', height: 360, bitrate: 400_000 },
        { id: 'v1080', height: 1080, bitrate: 5_000_000 },
      ],
      segments: [
        {
          id: 'hls-segment-1',
          index: 1,
          url: 'https://cdn.example.com/hls/vod/seg-1.ts',
          durationSec: 6,
        },
      ],
      audioTracks: [],
      subtitleTracks: [],
      closedCaptions: [],
      protection: { kind: 'none' },
      isLive: false,
    };

    const plan = planHlsSegments(manifest, {
      jobId: 'job-policy',
      selection: { mode: 'smallest' },
      qualityPolicy: 'highest',
    });

    expect(plan.variantId).toBe('v1080');
  });

  test('returns all segments when no trim is specified', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/vod/notrim.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:6',
        '#EXTINF:6,',
        'seg-0.ts',
        '#EXTINF:6,',
        'seg-1.ts',
        '#EXTINF:6,',
        'seg-2.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });

    const plan = planHlsSegments(manifest, { jobId: 'job-no-trim' });
    expect(plan.segments).toHaveLength(3);
    expect(plan.segments.map((s) => s.id)).toEqual([
      'hls-segment-1',
      'hls-segment-2',
      'hls-segment-3',
    ]);
  });

  test('filters segments by trim range [8, 20]', () => {
    // 5 segments of 6s each: [0-6), [6-12), [12-18), [18-24), [24-30)
    // Trim [8, 20] overlaps segments 1, 2, 3
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/vod/trim.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:6',
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXTINF:6,',
        'seg-0.ts',
        '#EXTINF:6,',
        'seg-1.ts',
        '#EXTINF:6,',
        'seg-2.ts',
        '#EXTINF:6,',
        'seg-3.ts',
        '#EXTINF:6,',
        'seg-4.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });

    const plan = planHlsSegments(manifest, {
      jobId: 'job-trim',
      selection: { mode: 'best', trim: { startSec: 8, endSec: 20 } },
    });

    // Init segment is always included, plus segments 2, 3, 4 (1-indexed IDs)
    // seg-1=[0,6) seg-2=[6,12) seg-3=[12,18) seg-4=[18,24) seg-5=[24,30)
    // Trim [8, 20] overlaps seg-2, seg-3, seg-4
    expect(plan.segments.map((s) => s.id)).toEqual([
      'hls-init-0',
      'hls-segment-2',
      'hls-segment-3',
      'hls-segment-4',
    ]);
  });

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
