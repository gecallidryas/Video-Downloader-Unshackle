import { describe, expect, test } from 'vitest';
import { parseHlsManifest } from '../parse-hls-manifest';

describe('I-frame stream filtering', () => {
  test('excludes I-frame-only streams from variants', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/master.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=800000',
        'low.m3u8',
        '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=400000,URI="iframe.m3u8"',
        '#EXT-X-STREAM-INF:BANDWIDTH=1400000',
        'mid.m3u8',
      ].join('\n'),
    });

    expect(manifest.variants.map((variant) => variant.url)).toEqual([
      'https://cdn.example.com/low.m3u8',
      'https://cdn.example.com/mid.m3u8',
    ]);
  });
});
