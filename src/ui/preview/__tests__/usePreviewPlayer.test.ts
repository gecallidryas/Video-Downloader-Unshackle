import { describe, expect, test } from 'vitest';
import { shouldUseHlsFallback } from '../usePreviewPlayer';

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
