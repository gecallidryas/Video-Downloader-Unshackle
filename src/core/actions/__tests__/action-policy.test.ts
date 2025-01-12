import { describe, expect, test } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  SUPPORTED_DOWNLOAD_ACTIONS,
  buildDownloadIntent,
  resolveDownloadAction,
  shouldQueueDownloadAction,
} from '../action-policy';

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 1,
    mediaKind: 'video',
    protocol: 'hls',
    status: 'ready',
    pageUrl: 'https://video.example.com/watch',
    origin: 'https://video.example.com',
    displayName: 'Example stream',
    manifestUrl: 'https://cdn.example.com/master.m3u8',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'hls.js' },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('download action policy', () => {
  test('declares the supported source-compatible actions', () => {
    expect(SUPPORTED_DOWNLOAD_ACTIONS).toEqual([
      'download',
      'download_as',
      'download_audio',
      'copy',
      'record_live',
    ]);
  });

  test('resolves host defaults before global defaults including wildcard rules', () => {
    expect(
      resolveDownloadAction(candidate(), {
        defaultAction: 'download',
        defaultActionPerHost: {
          'video.example.com': 'download_audio',
        },
      }),
    ).toBe('download_audio');

    expect(
      resolveDownloadAction(
        candidate({ pageUrl: 'https://clips.sub.example.net/watch' }),
        {
          defaultAction: 'download',
          defaultActionPerHost: {
            '*.example.net': 'record_live',
          },
        },
      ),
    ).toBe('record_live');
  });

  test('copy actions do not enter the download queue', () => {
    expect(shouldQueueDownloadAction('copy')).toBe(false);
    expect(shouldQueueDownloadAction('download')).toBe(true);
  });

  test('maps audio and live actions onto explicit download intent without bypassing protection checks', () => {
    expect(
      buildDownloadIntent(candidate(), {
        action: 'download_audio',
        selection: { mode: 'best' },
      }),
    ).toMatchObject({
      action: 'download_audio',
      shouldQueue: true,
      selection: { outputKind: 'audio-only' },
      requiresProtectionCheck: true,
    });

    expect(
      buildDownloadIntent(candidate({ protection: { kind: 'drm' }, status: 'protected' }), {
        action: 'record_live',
        selection: { mode: 'best' },
      }),
    ).toMatchObject({
      action: 'record_live',
      liveRecording: true,
      requiresProtectionCheck: true,
    });
  });
});
