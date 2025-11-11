import { describe, expect, test } from 'vitest';
import { detectBrowser, supportsRefererInDownload } from '../browser-headers';

describe('detectBrowser', () => {
  test('detects firefox', () => {
    expect(
      detectBrowser({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
      }),
    ).toBe('firefox');
  });

  test('detects chrome', () => {
    expect(
      detectBrowser({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      }),
    ).toBe('chrome');
  });

  test('detects edge as chromium-based', () => {
    expect(
      detectBrowser({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120',
      }),
    ).toBe('chrome');
  });

  test('returns unknown for empty or unrecognized UA', () => {
    expect(detectBrowser({ userAgent: '' })).toBe('unknown');
  });
});

describe('supportsRefererInDownload', () => {
  test('firefox supports referer header in downloads API', () => {
    expect(supportsRefererInDownload('firefox')).toBe(true);
  });

  test('chrome cannot pass referer via downloads API', () => {
    expect(supportsRefererInDownload('chrome')).toBe(false);
  });

  test('unknown defaults to false (safe)', () => {
    expect(supportsRefererInDownload('unknown')).toBe(false);
  });
});
