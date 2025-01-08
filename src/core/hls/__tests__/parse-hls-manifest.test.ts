import { describe, expect, test } from 'vitest';
import masterPlaylist from '@/src/fixtures/hls/master.m3u8?raw';
import protectedPlaylist from '@/src/fixtures/hls/protected.m3u8?raw';
import { parseHlsManifest } from '../parse-hls-manifest';

describe('parseHlsManifest', () => {
  test('parses clear HLS master manifests into variants, audio, and subtitle groups', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/master.m3u8',
      content: masterPlaylist,
    });

    expect(manifest).toMatchObject({
      protocol: 'hls',
      sourceUrl: 'https://cdn.example.com/hls/master.m3u8',
      isLive: false,
      protection: { kind: 'none' },
    });
    expect(manifest.variants).toEqual([
      expect.objectContaining({
        id: 'variant-1',
        url: 'https://cdn.example.com/hls/video/720p/prog.m3u8',
        width: 1280,
        height: 720,
        bitrate: 2800000,
        averageBitrate: 2500000,
        frameRate: 29.97,
        codecs: ['avc1.64001f', 'mp4a.40.2'],
        audioGroupId: 'aud-main',
        subtitleGroupId: 'subs',
      }),
      expect.objectContaining({
        id: 'variant-2',
        url: 'https://cdn.example.com/hls/video/1080p/prog.m3u8',
        width: 1920,
        height: 1080,
      }),
    ]);
    expect(manifest.audioTracks).toEqual([
      expect.objectContaining({
        id: 'audio-aud-main-English',
        kind: 'audio',
        groupId: 'aud-main',
        language: 'en',
        default: true,
      }),
    ]);
    expect(manifest.subtitleTracks).toEqual([
      expect.objectContaining({
        id: 'subtitle-subs-English-CC',
        kind: 'subtitle',
        groupId: 'subs',
        url: 'https://cdn.example.com/hls/subs/en/prog.m3u8',
        format: 'unknown',
      }),
    ]);
  });

  test('classifies protected HLS manifests as blocked for generic segmented flow', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/protected.m3u8',
      content: protectedPlaylist,
    });

    expect(manifest.protection).toEqual({
      kind: 'sample-aes',
      method: 'SAMPLE-AES',
      keyFormat: 'com.apple.streamingkeydelivery',
      keyUri: 'skd://protected-key',
      reason: 'HLS manifest declares encrypted media segments.',
    });
  });
});
