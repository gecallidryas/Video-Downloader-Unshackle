import { describe, expect, test } from 'vitest';
import {
  isYtDlpAvailable,
  isYouTubeUrl,
  ytDlpPageActionLabel,
  YTDLP_REQUIRED_NOTICE,
} from '../ytdlp-delegation';

describe('isYtDlpAvailable', () => {
  test('requires native features and the yt-dlp engine enabled', () => {
    expect(
      isYtDlpAvailable({ enableNativeFeatures: true, useNativeYtDlp: true }),
    ).toBe(true);
    expect(
      isYtDlpAvailable({ enableNativeFeatures: false, useNativeYtDlp: true }),
    ).toBe(false);
    expect(
      isYtDlpAvailable({ enableNativeFeatures: true, useNativeYtDlp: false }),
    ).toBe(false);
  });

  test('treats a failed readiness check as unavailable but unknown as available', () => {
    expect(
      isYtDlpAvailable({
        enableNativeFeatures: true,
        useNativeYtDlp: true,
        nativeReady: false,
      }),
    ).toBe(false);
    expect(
      isYtDlpAvailable({
        enableNativeFeatures: true,
        useNativeYtDlp: true,
        nativeReady: undefined,
      }),
    ).toBe(true);
  });
});

describe('isYouTubeUrl', () => {
  test('matches YouTube hosts and rejects others', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isYouTubeUrl('https://youtu.be/abc')).toBe(true);
    expect(isYouTubeUrl('https://m.youtube.com/watch?v=abc')).toBe(true);
    expect(isYouTubeUrl('https://music.youtube.com/watch?v=abc')).toBe(true);
    expect(isYouTubeUrl('https://vimeo.com/123')).toBe(false);
    expect(isYouTubeUrl('not a url')).toBe(false);
    expect(isYouTubeUrl(undefined)).toBe(false);
  });
});

describe('ytDlpPageActionLabel', () => {
  test('labels YouTube explicitly, falls back to generic page label', () => {
    expect(ytDlpPageActionLabel('https://youtu.be/abc')).toContain('YouTube');
    expect(ytDlpPageActionLabel('https://example.com/video')).toContain('this page');
    expect(YTDLP_REQUIRED_NOTICE).toContain('yt-dlp');
  });
});
