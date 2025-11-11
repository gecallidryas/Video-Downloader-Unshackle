import { describe, expect, test } from 'vitest';
import { parseHlsManifest } from '../parse-hls-manifest';
import { planHlsSegments } from '../plan-hls-segments';
import { propagateQueryParams } from '../signed-query';

describe('signed HLS query propagation', () => {
  test('appends master query params to same-origin segment URLs', () => {
    expect(
      propagateQueryParams(
        'https://cdn.example/seg0.ts',
        'https://cdn.example/master.m3u8?token=abc&exp=123',
      ),
    ).toBe('https://cdn.example/seg0.ts?token=abc&exp=123');
  });

  test('does not overwrite existing segment query params', () => {
    const result = propagateQueryParams(
      'https://cdn.example/seg0.ts?existing=1',
      'https://cdn.example/master.m3u8?token=abc&existing=master',
    );
    const parsed = new URL(result);

    expect(parsed.searchParams.get('existing')).toBe('1');
    expect(parsed.searchParams.get('token')).toBe('abc');
  });

  test('skips propagation for different origins', () => {
    expect(
      propagateQueryParams(
        'https://other.example/seg0.ts',
        'https://cdn.example/master.m3u8?token=abc',
      ),
    ).toBe('https://other.example/seg0.ts');
  });

  test('planner propagates master query params to init, segment, and key URLs', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example/hls/video.m3u8?token=abc',
      content: [
        '#EXTM3U',
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
        '#EXTINF:6,',
        'seg-1.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });

    const plan = planHlsSegments(manifest, { jobId: 'job-signed-query' });

    expect(plan.segments[0]?.url).toBe(
      'https://cdn.example/hls/init.mp4?token=abc',
    );
    expect(plan.segments[1]?.url).toBe(
      'https://cdn.example/hls/seg-1.ts?token=abc',
    );
    expect(plan.segments[1]?.encryption?.keyUri).toBe(
      'https://cdn.example/hls/key.bin?token=abc',
    );
  });
});
