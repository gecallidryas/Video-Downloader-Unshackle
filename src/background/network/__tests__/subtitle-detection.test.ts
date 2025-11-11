import { describe, expect, test } from 'vitest';
import { classifyRequest } from '../classify-request';

describe('passive subtitle detection', () => {
  test.each([
    ['https://cdn.example/subs.vtt', 'subtitle_vtt'],
    ['https://cdn.example/subs.srt', 'subtitle_srt'],
    ['https://cdn.example/subs.ttml', 'subtitle_ttml'],
    ['https://cdn.example/subs.dfxp', 'subtitle_dfxp'],
  ] as const)('classifies %s as %s', (url, expectedCategory) => {
    expect(classifyRequest({ url, type: 'xmlhttprequest' })).toMatchObject({
      category: expectedCategory,
      protocol: 'direct',
      mediaKind: 'subtitle',
    });
  });

  test.each([
    ['text/vtt', 'subtitle_vtt'],
    ['application/x-subrip', 'subtitle_srt'],
    ['application/ttml+xml', 'subtitle_ttml'],
    ['application/ttaf+xml', 'subtitle_dfxp'],
  ] as const)('classifies MIME %s as %s', (mimeType, expectedCategory) => {
    expect(
      classifyRequest({
        url: 'https://cdn.example/subtitle',
        responseHeaders: [{ name: 'content-type', value: mimeType }],
      }),
    ).toMatchObject({
      category: expectedCategory,
      protocol: 'direct',
      mediaKind: 'subtitle',
    });
  });
});
