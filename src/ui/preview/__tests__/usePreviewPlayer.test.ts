import { describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { shouldUseHlsFallback, usePreviewPlayer } from '../usePreviewPlayer';

vi.mock('hls.js', () => ({
  default: class FakeHls {
    static isSupported() {
      return true;
    }
    loadSource() {}
    attachMedia() {}
    destroy() {}
  },
  isSupported: () => true,
}));

describe('shouldUseHlsFallback', () => {
  test('returns false for direct downloads', () => {
    expect(shouldUseHlsFallback('direct', () => 'probably')).toBe(false);
  });

  test('returns false for dash', () => {
    expect(shouldUseHlsFallback('dash', () => '')).toBe(false);
  });

  test('returns true for hls when canPlayType reports empty', () => {
    expect(shouldUseHlsFallback('hls', () => '')).toBe(true);
  });

  test('returns false for hls when canPlayType says maybe', () => {
    expect(shouldUseHlsFallback('hls', () => 'maybe')).toBe(false);
  });

  test('returns true for hls when canPlayType is unavailable', () => {
    expect(shouldUseHlsFallback('hls', undefined)).toBe(true);
  });
});

describe('usePreviewPlayer playback strategy', () => {
  test('defaults to native playback', () => {
    const { result } = renderHook(() =>
      usePreviewPlayer({ sourceUrl: 'https://cdn.example.com/master.m3u8', protocol: 'hls' }),
    );
    expect(result.current.playbackStrategy).toBe('native');
  });

  test('flips to hls-js only after the hls.js instance attaches', async () => {
    const { result } = renderHook(() =>
      usePreviewPlayer({ sourceUrl: 'https://cdn.example.com/master.m3u8', protocol: 'hls' }),
    );

    const video = document.createElement('video');
    // Force the native-HLS-unsupported branch so the hls.js fallback engages.
    video.canPlayType = () => '' as '' | 'maybe' | 'probably';

    act(() => {
      result.current.videoRef(video);
    });

    await waitFor(() => {
      expect(result.current.playbackStrategy).toBe('hls-js');
    });
    expect(result.current.hlsFallbackAttempted).toBe(true);
  });

  test('stays native for direct sources (no fallback)', () => {
    const { result } = renderHook(() =>
      usePreviewPlayer({ sourceUrl: 'https://cdn.example.com/video.mp4', protocol: 'direct' }),
    );

    const video = document.createElement('video');
    act(() => {
      result.current.videoRef(video);
    });

    expect(result.current.playbackStrategy).toBe('native');
    expect(result.current.hlsFallbackAttempted).toBe(false);
  });
});
