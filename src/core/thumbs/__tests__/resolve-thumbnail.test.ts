import { describe, expect, test } from 'vitest';
import { resolveThumbnail } from '../resolve-thumbnail';

describe('resolveThumbnail', () => {
  test('prefers direct frame captures and detector thumbnails before page fallbacks', () => {
    expect(
      resolveThumbnail({
        url: 'https://cdn.example.com/video.mp4',
        thumbnailDataUrl: 'data:image/png;base64,frame',
        thumbnailUrl: 'https://cdn.example.com/detector.jpg',
        pageContext: {
          ogImage: 'https://example.com/og.jpg',
        },
      }),
    ).toEqual({
      thumbnailDataUrl: 'data:image/png;base64,frame',
      thumbnailSource: 'frameCapture',
    });

    expect(
      resolveThumbnail({
        url: 'https://cdn.example.com/video.mp4',
        thumbnailUrl: 'https://cdn.example.com/detector.jpg',
        pageContext: {
          ogImage: 'https://example.com/og.jpg',
        },
      }),
    ).toEqual({
      thumbnailUrl: 'https://cdn.example.com/detector.jpg',
      thumbnailSource: 'detector',
    });
  });

  test('uses matching video poster, byte thumbnail, and metadata image fallbacks', () => {
    expect(
      resolveThumbnail({
        url: 'https://cdn.example.com/video.mp4',
        pageContext: {
          videoPosterCandidates: [
            {
              src: 'https://cdn.example.com/video.mp4',
              poster: 'https://example.com/poster.jpg',
            },
          ],
          ogImage: 'https://example.com/og.jpg',
        },
      }),
    ).toEqual({
      thumbnailUrl: 'https://example.com/poster.jpg',
      thumbnailSource: 'videoPoster',
    });

    expect(
      resolveThumbnail({
        url: 'https://cdn.example.com/video.mp4',
        thumbnailByteDataUrl: 'data:image/jpeg;base64,byte',
        pageContext: {},
      }),
    ).toEqual({
      thumbnailByteDataUrl: 'data:image/jpeg;base64,byte',
      thumbnailDataUrl: 'data:image/jpeg;base64,byte',
      thumbnailSource: 'byteRange',
    });

    expect(
      resolveThumbnail({
        url: 'https://cdn.example.com/video.mp4',
        pageContext: {
          ogImageSecure: 'https://example.com/secure.jpg',
          ogImage: 'https://example.com/og.jpg',
        },
      }),
    ).toEqual({
      thumbnailUrl: 'https://example.com/secure.jpg',
      thumbnailSource: 'metaImage',
    });
  });

  test('returns an explicit none source when no thumbnail candidate exists', () => {
    expect(resolveThumbnail({ pageContext: {} })).toEqual({
      thumbnailSource: 'none',
    });
  });
});
