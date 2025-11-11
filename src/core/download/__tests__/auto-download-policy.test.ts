import { describe, expect, test } from 'vitest';
import { isAutoDownloadEligible } from '../auto-download-policy';

const baseSettings = {
  autoDownloadEnabled: true,
  autoDownloadMinSize: 102_400,
  autoDownloadBlacklist: [],
  advancedMode: true,
};

describe('auto-download policy', () => {
  test('rejects when feature is disabled', () => {
    expect(
      isAutoDownloadEligible(
        { url: 'https://a.com/v.mp4', sizeBytes: 1_000_000, mediaKind: 'direct_media', protected: false },
        { ...baseSettings, autoDownloadEnabled: false },
      ),
    ).toBe(false);
  });

  test('rejects when advancedMode is off', () => {
    expect(
      isAutoDownloadEligible(
        { url: 'https://a.com/v.mp4', sizeBytes: 1_000_000, mediaKind: 'direct_media', protected: false },
        { ...baseSettings, advancedMode: false },
      ),
    ).toBe(false);
  });

  test('rejects protected candidates', () => {
    expect(
      isAutoDownloadEligible(
        { url: 'https://a.com/v.mp4', sizeBytes: 1_000_000, mediaKind: 'direct_media', protected: true },
        baseSettings,
      ),
    ).toBe(false);
  });

  test('rejects when below minimum size', () => {
    expect(
      isAutoDownloadEligible(
        { url: 'https://a.com/v.mp4', sizeBytes: 50_000, mediaKind: 'direct_media', protected: false },
        baseSettings,
      ),
    ).toBe(false);
  });

  test('rejects non-direct media kinds', () => {
    expect(
      isAutoDownloadEligible(
        { url: 'https://a.com/v.m3u8', sizeBytes: 1_000_000, mediaKind: 'hls_manifest', protected: false },
        baseSettings,
      ),
    ).toBe(false);
  });

  test('rejects URL matching blacklist glob', () => {
    expect(
      isAutoDownloadEligible(
        { url: 'https://ads.example.com/v.mp4', sizeBytes: 1_000_000, mediaKind: 'direct_media', protected: false },
        { ...baseSettings, autoDownloadBlacklist: ['*ads.example.com*'] },
      ),
    ).toBe(false);
  });

  test('accepts safe direct media when all gates pass', () => {
    expect(
      isAutoDownloadEligible(
        { url: 'https://a.com/v.mp4', sizeBytes: 1_000_000, mediaKind: 'direct_media', protected: false },
        baseSettings,
      ),
    ).toBe(true);
  });
});
