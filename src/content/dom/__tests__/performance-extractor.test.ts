import { describe, expect, test } from 'vitest';
import { extractMediaResources } from '../performance-extractor';

describe('extractMediaResources', () => {
  test('returns no resources unless advanced mode is enabled', () => {
    const entries = [
      { name: 'https://cdn.example/video.m3u8', initiatorType: 'xmlhttprequest' },
    ] as PerformanceResourceTiming[];

    expect(extractMediaResources(entries)).toEqual([]);
  });

  test('extracts media resource URLs from performance entries', () => {
    const entries = [
      { name: 'https://cdn.example/video.m3u8', initiatorType: 'xmlhttprequest' },
      { name: 'https://cdn.example/style.css', initiatorType: 'link' },
      { name: 'https://cdn.example/chunk.ts', initiatorType: 'xmlhttprequest' },
      { name: 'https://cdn.example/audio.mp3?token=1', initiatorType: 'fetch' },
    ] as PerformanceResourceTiming[];

    const urls = extractMediaResources(entries, { advancedMode: true });

    expect(urls).toEqual([
      'https://cdn.example/video.m3u8',
      'https://cdn.example/chunk.ts',
      'https://cdn.example/audio.mp3?token=1',
    ]);
  });

  test('reads resource timing entries safely when no entries are passed', () => {
    const originalPerformance = globalThis.performance;
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: {
        getEntriesByType: () => [
          { name: 'https://cdn.example/manifest.mpd', initiatorType: 'fetch' },
          { name: 'https://cdn.example/app.js', initiatorType: 'script' },
        ],
      },
    });

    expect(extractMediaResources(undefined, { advancedMode: true })).toEqual([
      'https://cdn.example/manifest.mpd',
    ]);

    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: originalPerformance,
    });
  });
});
