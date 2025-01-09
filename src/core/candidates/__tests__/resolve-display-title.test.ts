import { describe, expect, test } from 'vitest';
import { resolveDisplayTitle } from '../resolve-display-title';

describe('resolveDisplayTitle', () => {
  test('prefers a meaningful detector title over page and URL titles', () => {
    expect(
      resolveDisplayTitle({
        sourceType: 'hls',
        detectedTitle: 'Episode 4',
        pageContext: {
          ogTitle: 'Open Graph Title',
          pageTitle: 'Page Title',
        },
        tabTitle: 'Tab Title',
        url: 'https://cdn.example.com/video.mp4',
      }),
    ).toEqual({
      displayTitle: 'Episode 4',
      titleSource: 'detector',
    });
  });

  test('falls back through page, tab, URL, and generated titles', () => {
    expect(
      resolveDisplayTitle({
        sourceType: 'dash',
        detectedTitle: 'DASH 1080p',
        pageContext: {
          ogTitle: 'Page Context Title',
        },
        tabTitle: 'Tab Title',
        url: 'https://cdn.example.com/fallback-video.mp4',
      }),
    ).toEqual({
      displayTitle: 'Page Context Title',
      titleSource: 'page',
    });

    expect(
      resolveDisplayTitle({
        sourceType: 'direct',
        pageContext: {},
        tabTitle: 'Tab Title',
        url: 'https://cdn.example.com/fallback-video.mp4',
      }),
    ).toEqual({
      displayTitle: 'Tab Title',
      titleSource: 'tab',
    });

    expect(
      resolveDisplayTitle({
        sourceType: 'direct',
        pageContext: {},
        url: 'https://cdn.example.com/fallback-video.mp4',
      }),
    ).toEqual({
      displayTitle: 'fallback video',
      titleSource: 'url',
    });

    expect(
      resolveDisplayTitle({
        sourceType: 'hls',
        mediaKind: 'video',
        pageContext: {},
        fallbackIndex: 3,
      }),
    ).toEqual({
      displayTitle: 'Untitled HLS Stream #3',
      titleSource: 'auto',
    });
  });
});
