import { describe, expect, test } from 'vitest';
import {
  normalizeContainerFromMime,
  normalizeQualityLabel,
} from '../quality-normalization';

describe('host quality normalization', () => {
  test.each([
    [360, 'low'],
    [480, 'standard'],
    [720, 'high'],
    [1080, 'full'],
    [1440, 'quad'],
    [2160, 'ultra'],
  ] as const)('normalizes %ip to %s', (height, expected) => {
    expect(normalizeQualityLabel(height)).toBe(expected);
  });

  test.each([
    ['video/mp4', 'mp4'],
    ['video/webm', 'webm'],
    ['application/x-mpegURL', 'm3u8'],
    ['application/vnd.apple.mpegurl; charset=utf-8', 'm3u8'],
    ['application/dash+xml', 'mpd'],
    ['application/octet-stream', 'unknown'],
  ] as const)('normalizes MIME %s to %s', (mime, expected) => {
    expect(normalizeContainerFromMime(mime)).toBe(expected);
  });
});
