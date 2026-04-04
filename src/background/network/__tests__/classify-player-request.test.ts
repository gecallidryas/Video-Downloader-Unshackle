import { describe, expect, test } from 'vitest';
import { classifyPlayerRequest } from '../classify-request';

describe('classifyPlayerRequest — MAIN-world fetch/XHR manifest detection', () => {
  test('detects HLS by .m3u8 extension', () => {
    expect(
      classifyPlayerRequest({ url: 'https://cdn.example.com/master.m3u8' }),
    ).toEqual({
      category: 'hls_manifest',
      protocol: 'hls',
      url: 'https://cdn.example.com/master.m3u8',
      mimeType: undefined,
    });
  });

  test('detects HLS by application/vnd.apple.mpegurl content-type even with opaque URL', () => {
    const result = classifyPlayerRequest({
      url: 'https://cdn.example.com/playlist?token=abc',
      contentType: 'application/vnd.apple.mpegurl; charset=utf-8',
    });

    expect(result?.protocol).toBe('hls');
    expect(result?.category).toBe('hls_manifest');
    expect(result?.mimeType).toBe('application/vnd.apple.mpegurl');
  });

  test('detects DASH by .mpd extension', () => {
    expect(classifyPlayerRequest({ url: 'https://x/y/stream.mpd' })?.protocol).toBe(
      'dash',
    );
  });

  test('detects DASH by application/dash+xml content-type', () => {
    expect(
      classifyPlayerRequest({
        url: 'https://x/manifest',
        contentType: 'application/dash+xml',
      })?.protocol,
    ).toBe('dash');
  });

  test('returns undefined for a non-manifest request (segment / image / api)', () => {
    expect(classifyPlayerRequest({ url: 'https://x/seg1.ts' })).toBeUndefined();
    expect(
      classifyPlayerRequest({ url: 'https://x/poster.jpg' }),
    ).toBeUndefined();
    expect(
      classifyPlayerRequest({
        url: 'https://x/api/play',
        contentType: 'application/json',
      }),
    ).toBeUndefined();
  });
});
