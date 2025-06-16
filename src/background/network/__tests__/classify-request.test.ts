import { describe, expect, test } from 'vitest';
import { classifyRequest } from '../classify-request';

describe('classifyRequest', () => {
  test('classifies manifest URLs and direct media URLs from request-like inputs', () => {
    expect(
      classifyRequest({ url: 'https://cdn.example.com/master.m3u8?token=1' }),
    ).toMatchObject({
      category: 'hls_manifest',
      protocol: 'hls',
      mediaKind: 'video',
    });

    expect(
      classifyRequest({ url: 'https://cdn.example.com/manifest.mpd' }),
    ).toMatchObject({
      category: 'dash_manifest',
      protocol: 'dash',
      mediaKind: 'video',
    });

    expect(
      classifyRequest({
        url: 'https://cdn.example.com/trailer.mp4',
        responseHeaders: [{ name: 'content-type', value: 'video/mp4' }],
      }),
    ).toMatchObject({
      category: 'direct_media',
      protocol: 'direct',
      mediaKind: 'video',
      mimeType: 'video/mp4',
    });
  });

  test('recognizes subtitle files and obvious segment requests', () => {
    expect(
      classifyRequest({ url: 'https://cdn.example.com/captions.en.vtt' }),
    ).toMatchObject({
      category: 'subtitle_vtt',
      protocol: 'direct',
      mediaKind: 'subtitle',
    });

    expect(
      classifyRequest({ url: 'https://cdn.example.com/video/seg-0042.m4s' }),
    ).toMatchObject({
      category: 'segment',
      protocol: 'unknown',
    });

    expect(
      classifyRequest({ url: 'https://cdn.example.com/app.js' }),
    ).toMatchObject({
      category: 'unknown',
      protocol: 'unknown',
    });
  });

  test('classifies broader HLS and DASH source semantics', () => {
    expect(
      classifyRequest({ url: 'https://cdn.example.com/live/index.m3u' }),
    ).toMatchObject({
      category: 'hls_manifest',
      protocol: 'hls',
    });

    expect(
      classifyRequest({
        url: 'https://cdn.example.com/playlist?id=42',
        responseHeaders: [
          { name: 'content-type', value: 'application/mpegurl; charset=utf-8' },
        ],
      }),
    ).toMatchObject({
      category: 'hls_manifest',
      protocol: 'hls',
      mimeType: 'application/mpegurl',
    });

    expect(
      classifyRequest({
        url: 'https://cdn.example.com/path/manifest',
        responseHeaders: [
          { name: 'content-type', value: 'video/vnd.mpeg.dash.mpd' },
        ],
      }),
    ).toMatchObject({
      category: 'dash_manifest',
      protocol: 'dash',
      mimeType: 'video/vnd.mpeg.dash.mpd',
    });
  });

  test('does not promote adaptive component assets to direct cards', () => {
    expect(
      classifyRequest({
        url: 'https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/720x720/file.mp4',
        responseHeaders: [{ name: 'content-type', value: 'video/mp4' }],
      }),
    ).toMatchObject({
      category: 'ignored',
      protocol: 'unknown',
    });

    expect(
      classifyRequest({
        url: 'https://cdn.example.com/media/segment-100.ts',
        responseHeaders: [{ name: 'content-type', value: 'video/mp2t' }],
      }),
    ).toMatchObject({
      category: 'segment',
      protocol: 'unknown',
    });
  });

  test('turns DRM/license request markers into protection evidence', () => {
    expect(
      classifyRequest({
        url: 'https://license.example.com/widevine/license',
        type: 'xmlhttprequest',
      }),
    ).toMatchObject({
      category: 'license',
      protocol: 'unknown',
      evidence: {
        notes: expect.arrayContaining([
          'category:license',
          'drm:widevine',
          'license-request:true',
        ]),
      },
    });
  });
});
