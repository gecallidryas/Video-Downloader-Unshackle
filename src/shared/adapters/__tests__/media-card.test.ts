import { describe, expect, test } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { toDetectedMedia } from '../media-card';

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'hls',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    pageTitle: 'Example page',
    origin: 'https://example.com',
    displayName: 'Example stream',
    manifestUrl: 'https://cdn.example.com/master.m3u8',
    durationSec: 120,
    protection: { kind: 'none' },
    variants: [
      {
        id: 'v720',
        url: 'https://cdn.example.com/720.m3u8',
        height: 720,
        bitrate: 1_200_000,
        frameRate: 59.94,
        isDefault: true,
      },
    ],
    audioTracks: [
      {
        id: 'audio-en',
        kind: 'audio',
        language: 'en',
        channels: '5.1',
        default: true,
        autoselect: true,
        bitrate: 128_000,
        url: 'https://cdn.example.com/audio-en.m3u8',
      },
    ],
    subtitleTracks: [
      {
        id: 'sub-en',
        kind: 'subtitle',
        language: 'en',
        format: 'vtt',
        default: true,
        url: 'https://cdn.example.com/sub-en.vtt',
      },
    ],
    evidence: [],
    preview: { playable: true, adapter: 'hls.js' },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('toDetectedMedia', () => {
  test('preserves variant and track URLs and maps playback metadata for real cards', () => {
    const media = toDetectedMedia(candidate());

    expect(media.url).toBe('https://cdn.example.com/720.m3u8');
    expect(media.audioTracks?.[0]).toMatchObject({
      url: 'https://cdn.example.com/audio-en.m3u8',
      channels: '5.1',
      default: true,
      autoselect: true,
    });
    expect(media.subtitleTracks?.[0]).toMatchObject({
      url: 'https://cdn.example.com/sub-en.vtt',
      default: true,
    });
    expect(media).toMatchObject({
      fps: 59.94,
      channels: '5.1',
      default: true,
      autoselect: true,
      bitrate: 1_200_000,
      durationSec: 120,
    });
  });
});
