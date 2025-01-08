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
      category: 'subtitle',
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
});
