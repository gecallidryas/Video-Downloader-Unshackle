import { describe, expect, test } from 'vitest';
import type {
  DownloadSelection,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import {
  resolveBrowserDownloadCapability,
  resolveBrowserPreviewCapability,
  resolveBrowserThumbnailCapability,
} from '../browser-capabilities';

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: 'Example video',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function selection(overrides: Partial<DownloadSelection> = {}): DownloadSelection {
  return {
    mode: 'best',
    ...overrides,
  };
}

describe('browser media capability resolver', () => {
  test('resolves direct download without trim', () => {
    expect(
      resolveBrowserDownloadCapability({
        candidate: candidate(),
        selection: selection(),
      }),
    ).toMatchObject({
      available: true,
      capability: 'direct-download',
    });
  });

  test('resolves direct trim to browser WebM recording when enabled', () => {
    expect(
      resolveBrowserDownloadCapability({
        candidate: candidate(),
        selection: selection({ trim: { startSec: 5, endSec: 12 } }),
        allowBrowserRecording: true,
      }),
    ).toMatchObject({
      available: true,
      capability: 'direct-webm-recording',
      outputExtension: 'webm',
      outputMimeType: 'video/webm',
    });
  });

  test('requires native helper for direct trim when browser recording is disabled', () => {
    expect(
      resolveBrowserDownloadCapability({
        candidate: candidate(),
        selection: selection({ trim: { startSec: 5, endSec: 12 } }),
        allowBrowserRecording: false,
      }),
    ).toMatchObject({
      available: false,
      capability: 'native-required',
    });
  });

  test('resolves HLS browser fallback as raw TS', () => {
    expect(
      resolveBrowserDownloadCapability({
        candidate: candidate({
          protocol: 'hls',
          sourceUrl: undefined,
          manifestUrl: 'https://cdn.example.com/master.m3u8',
          mimeType: 'application/vnd.apple.mpegurl',
        }),
        selection: selection(),
      }),
    ).toMatchObject({
      available: true,
      capability: 'hls-raw-ts',
      outputExtension: 'ts',
      outputMimeType: 'video/mp2t',
    });
  });

  test('resolves DASH browser fallback as raw segments', () => {
    expect(
      resolveBrowserDownloadCapability({
        candidate: candidate({
          protocol: 'dash',
          sourceUrl: undefined,
          manifestUrl: 'https://cdn.example.com/manifest.mpd',
          mimeType: 'application/dash+xml',
        }),
        selection: selection(),
      }),
    ).toMatchObject({
      available: true,
      capability: 'dash-raw-segments',
    });
  });

  test('blocks protected candidates', () => {
    expect(
      resolveBrowserDownloadCapability({
        candidate: candidate({
          status: 'protected',
          protection: { kind: 'drm', drmSystems: ['widevine'] },
        }),
        selection: selection(),
      }),
    ).toMatchObject({
      available: false,
      capability: 'unsupported',
    });
  });

  test('resolves static poster thumbnail before generated thumbnail paths', () => {
    expect(
      resolveBrowserThumbnailCapability(
        candidate({
          posterUrl: 'https://cdn.example.com/poster.jpg',
        }),
      ),
    ).toMatchObject({
      available: true,
      capability: 'static-thumbnail',
    });
  });

  test('resolves direct thumbnail without static asset to frame capture', () => {
    expect(resolveBrowserThumbnailCapability(candidate())).toMatchObject({
      available: true,
      capability: 'direct-frame-thumbnail',
    });
  });

  test('requires native helper for HLS and DASH thumbnails without static assets', () => {
    expect(
      resolveBrowserThumbnailCapability(
        candidate({
          protocol: 'hls',
          sourceUrl: undefined,
          manifestUrl: 'https://cdn.example.com/master.m3u8',
        }),
      ),
    ).toMatchObject({
      available: false,
      capability: 'native-required',
    });
    expect(
      resolveBrowserThumbnailCapability(
        candidate({
          protocol: 'dash',
          sourceUrl: undefined,
          manifestUrl: 'https://cdn.example.com/manifest.mpd',
        }),
      ),
    ).toMatchObject({
      available: false,
      capability: 'native-required',
    });
  });

  test('resolves direct preview to browser recording and HLS preview to native required', () => {
    expect(resolveBrowserPreviewCapability(candidate())).toMatchObject({
      available: true,
      capability: 'direct-preview-recording',
      outputExtension: 'webm',
      outputMimeType: 'video/webm',
    });
    expect(
      resolveBrowserPreviewCapability(
        candidate({
          protocol: 'hls',
          sourceUrl: undefined,
          manifestUrl: 'https://cdn.example.com/master.m3u8',
        }),
      ),
    ).toMatchObject({
      available: false,
      capability: 'native-required',
    });
  });
});
