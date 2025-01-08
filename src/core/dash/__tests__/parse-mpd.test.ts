import { describe, expect, test } from 'vitest';
import clearMpd from '@/src/fixtures/dash/clear.mpd?raw';
import protectedMpd from '@/src/fixtures/dash/protected.mpd?raw';
import { parseMpd } from '../parse-mpd';

describe('parseMpd', () => {
  test('parses clear MPDs into representations, audio tracks, and text tracks', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/clear.mpd',
      content: clearMpd,
    });

    expect(manifest).toMatchObject({
      protocol: 'dash',
      sourceUrl: 'https://cdn.example.com/dash/clear.mpd',
      isLive: false,
      durationSec: 15,
      protection: { kind: 'none' },
    });
    expect(manifest.variants).toEqual([
      expect.objectContaining({
        id: 'video-720',
        width: 1280,
        height: 720,
        bitrate: 2500000,
        codecs: ['avc1.64001f'],
      }),
    ]);
    expect(manifest.audioTracks).toEqual([
      expect.objectContaining({
        id: 'audio-en',
        kind: 'audio',
        language: 'en',
        bitrate: 128000,
        codec: 'mp4a.40.2',
      }),
    ]);
    expect(manifest.subtitleTracks).toEqual([
      expect.objectContaining({
        id: 'sub-en',
        kind: 'subtitle',
        language: 'en',
        format: 'vtt',
        url: 'https://cdn.example.com/dash/subs/en.vtt',
      }),
    ]);
  });

  test('classifies protected DASH content as blocked for generic segmented flow', () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/protected.mpd',
      content: protectedMpd,
    });

    expect(manifest.protection).toEqual({
      kind: 'drm',
      reason: 'DASH MPD declares ContentProtection.',
      drmSystems: ['widevine'],
    });
  });
});
