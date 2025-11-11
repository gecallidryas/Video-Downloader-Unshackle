import { describe, expect, test } from 'vitest';
import { extractPlayerSources } from '../player-extractor';

describe('extractPlayerSources', () => {
  test('returns no player sources unless advanced mode is enabled', () => {
    const mockWindow = {
      jwplayer: () => ({
        getConfig: () => ({ file: 'https://cdn.example/video.m3u8' }),
      }),
    };

    expect(extractPlayerSources(mockWindow)).toEqual([]);
  });

  test('detects JWPlayer config', () => {
    const mockWindow = {
      jwplayer: () => ({
        getConfig: () => ({
          file: 'https://cdn.example/video.m3u8',
          title: 'Launch Event',
        }),
      }),
    };

    expect(extractPlayerSources(mockWindow, { advancedMode: true })).toContainEqual(
      expect.objectContaining({
        url: 'https://cdn.example/video.m3u8',
        source: 'jwplayer',
        title: 'Launch Event',
      }),
    );
  });

  test('detects VideoJS and SoundManager sources', () => {
    const mockWindow = {
      videojs: {
        getPlayers: () => ({
          hero: {
            currentSources: () => [
              { src: 'https://cdn.example/video.mp4', type: 'video/mp4' },
            ],
          },
        }),
      },
      soundManager: {
        soundIDs: ['theme'],
        getSoundById: () => ({
          url: 'https://cdn.example/theme.mp3',
        }),
      },
    };

    expect(extractPlayerSources(mockWindow, { advancedMode: true })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://cdn.example/video.mp4',
          source: 'videojs',
          mimeType: 'video/mp4',
        }),
        expect.objectContaining({
          url: 'https://cdn.example/theme.mp3',
          source: 'soundmanager',
        }),
      ]),
    );
  });
});
