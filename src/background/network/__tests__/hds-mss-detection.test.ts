import { describe, expect, test } from 'vitest';
import { classifyRequest } from '../classify-request';

describe('HDS and MSS detection', () => {
  test('classifies F4M manifests with HDS protocol metadata', () => {
    expect(
      classifyRequest({
        url: 'https://cdn.example/live.f4m',
        type: 'xmlhttprequest',
        responseHeaders: [{ name: 'content-type', value: 'application/f4m+xml' }],
      }),
    ).toMatchObject({
      category: 'hds_manifest',
      protocol: 'hds',
      mediaKind: 'video',
    });
  });

  test('classifies ISM manifests with MSS protocol metadata', () => {
    expect(
      classifyRequest({
        url: 'https://cdn.example/live.ism/manifest',
        type: 'xmlhttprequest',
        responseHeaders: [
          { name: 'content-type', value: 'application/vnd.ms-sstr+xml' },
        ],
      }),
    ).toMatchObject({
      category: 'mss_manifest',
      protocol: 'mss',
      mediaKind: 'video',
    });
  });
});
