import { describe, expect, test } from 'vitest';
import masterPlaylist from '@/src/fixtures/hls/master.m3u8?raw';
import protectedPlaylist from '@/src/fixtures/hls/protected.m3u8?raw';
import { classifyHlsProtection } from '../classify-hls-protection';
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

  test('parses media playlist maps, byte ranges, discontinuities, and VOD duration', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/vod/prog.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:6',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="720@0"',
        '#EXTINF:5.5,',
        '#EXT-X-BYTERANGE:1000@720',
        'seg-1.m4s',
        '#EXT-X-DISCONTINUITY',
        '#EXTINF:4.5,',
        '#EXT-X-BYTERANGE:900',
        'seg-2.m4s',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });

    expect(manifest).toMatchObject({
      playlistKind: 'media',
      isLive: false,
      isEvent: false,
      durationSec: 10,
      initSegmentUrl: 'https://cdn.example.com/hls/vod/init.mp4',
      initSegmentByteRange: { start: 0, end: 719 },
    });
    expect(manifest.segments).toEqual([
      expect.objectContaining({
        id: 'hls-segment-1',
        index: 1,
        durationSec: 5.5,
        byteRange: { start: 720, end: 1719 },
      }),
      expect.objectContaining({
        id: 'hls-segment-2',
        index: 2,
        durationSec: 4.5,
        discontinuity: true,
        byteRange: { start: 1720, end: 2619 },
      }),
    ]);
  });

  test('detects event and live playlist types', () => {
    const eventManifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/event.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-PLAYLIST-TYPE:EVENT',
        '#EXT-X-TARGETDURATION:4',
        '#EXTINF:4,',
        'event-1.ts',
      ].join('\n'),
    });
    const liveManifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/live.m3u8',
      content: ['#EXTM3U', '#EXT-X-TARGETDURATION:4', '#EXTINF:4,', 'live-1.ts'].join(
        '\n',
      ),
    });

    expect(eventManifest).toMatchObject({ isLive: true, isEvent: true });
    expect(liveManifest).toMatchObject({ isLive: true, isEvent: false });
  });

  test('uses EXT-X-MEDIA-SEQUENCE for segment media sequence values', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/live.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:4',
        '#EXT-X-MEDIA-SEQUENCE:42',
        '#EXTINF:4,',
        'live-42.ts',
        '#EXTINF:4,',
        'live-43.ts',
      ].join('\n'),
    });

    expect(manifest.segments).toEqual([
      expect.objectContaining({ index: 1, mediaSequence: 42 }),
      expect.objectContaining({ index: 2, mediaSequence: 43 }),
    ]);
  });

  test('defaults media sequence values to zero-based HLS sequence numbers', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/vod.m3u8',
      content: [
        '#EXTM3U',
        '#EXTINF:4,',
        'seg-0.ts',
        '#EXTINF:4,',
        'seg-1.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });

    expect(manifest.segments).toEqual([
      expect.objectContaining({ index: 1, mediaSequence: 0 }),
      expect.objectContaining({ index: 2, mediaSequence: 1 }),
    ]);
  });

  test('detects EXT-X-SESSION-KEY in master playlists', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/master.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://keys.example.com/session-key"',
        '#EXT-X-STREAM-INF:BANDWIDTH=800000',
        'video.m3u8',
      ].join('\n'),
    });

    expect(manifest.protection).toEqual(
      expect.objectContaining({
        kind: 'aes-128',
        method: 'AES-128',
        keyUri: 'https://keys.example.com/session-key',
      }),
    );
  });

  test('EXT-X-KEY takes precedence over EXT-X-SESSION-KEY', () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/master.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://keys.example.com/session"',
        '#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.apple.streamingkeydelivery",URI="skd://drm"',
        '#EXT-X-STREAM-INF:BANDWIDTH=800000',
        'video.m3u8',
      ].join('\n'),
    });

    expect(manifest.protection.kind).toBe('sample-aes');
  });

  test('classifies AES-128 clear-key and DRM-style HLS protection separately', () => {
    expect(
      classifyHlsProtection([
        '#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.com/key",IV=0x01',
      ]),
    ).toEqual({
      kind: 'aes-128',
      method: 'AES-128',
      keyUri: 'https://keys.example.com/key',
      iv: '0x01',
      reason: 'HLS manifest declares AES-128 clear-key encrypted segments.',
    });

    expect(
      classifyHlsProtection([
        '#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.apple.streamingkeydelivery",URI="skd://asset"',
      ]),
    ).toMatchObject({
      kind: 'sample-aes',
      method: 'SAMPLE-AES',
      keyFormat: 'com.apple.streamingkeydelivery',
    });
  });
});
