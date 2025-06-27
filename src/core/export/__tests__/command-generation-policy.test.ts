import { describe, test, expect } from 'vitest';
import {
  isSensitiveHeader,
  buildHeaderFlags,
  wrapWithWarning,
} from '../command-generation-policy';

describe('command-generation-policy', () => {
  describe('isSensitiveHeader', () => {
    test.each([
      ['cookie', true],
      ['Cookie', true],
      ['set-cookie', true],
      ['Set-Cookie', true],
      ['authorization', true],
      ['Authorization', true],
      ['referer', false],
      ['Referer', false],
      ['origin', false],
      ['user-agent', false],
      ['content-type', false],
    ])('%s → sensitive=%s', (name, expected) => {
      expect(isSensitiveHeader(name)).toBe(expected);
    });
  });

  describe('buildHeaderFlags', () => {
    test('includes referer and user-agent by default', () => {
      const { flags, containsSensitiveData } = buildHeaderFlags({
        url: 'https://example.com/video.m3u8',
        referer: 'https://example.com',
        userAgent: 'Mozilla/5.0',
      });

      expect(flags).toContain('--referer "https://example.com"');
      expect(flags).toContain('--user-agent "Mozilla/5.0"');
      expect(containsSensitiveData).toBe(false);
    });

    test('excludes cookie and authorization when includeAuthHeaders is false', () => {
      const { flags, containsSensitiveData } = buildHeaderFlags({
        url: 'https://example.com/video.m3u8',
        cookie: 'session=abc123',
        authorization: 'Bearer token',
        includeAuthHeaders: false,
      });

      expect(flags).toHaveLength(0);
      expect(containsSensitiveData).toBe(false);
    });

    test('excludes cookie and authorization when includeAuthHeaders is undefined', () => {
      const { flags, containsSensitiveData } = buildHeaderFlags({
        url: 'https://example.com/video.m3u8',
        cookie: 'session=abc123',
        authorization: 'Bearer token',
      });

      expect(flags).toHaveLength(0);
      expect(containsSensitiveData).toBe(false);
    });

    test('includes cookie and authorization when includeAuthHeaders is true', () => {
      const { flags, containsSensitiveData } = buildHeaderFlags({
        url: 'https://example.com/video.m3u8',
        cookie: 'session=abc123',
        authorization: 'Bearer token',
        includeAuthHeaders: true,
      });

      expect(flags).toContain('--add-header "Cookie: session=abc123"');
      expect(flags).toContain('--add-header "Authorization: Bearer token"');
      expect(containsSensitiveData).toBe(true);
    });

    test('containsSensitiveData is false when includeAuthHeaders true but no auth values', () => {
      const { flags, containsSensitiveData } = buildHeaderFlags({
        url: 'https://example.com/video.m3u8',
        referer: 'https://example.com',
        includeAuthHeaders: true,
      });

      expect(flags).toHaveLength(1);
      expect(containsSensitiveData).toBe(false);
    });
  });

  describe('wrapWithWarning', () => {
    test('prepends warning when containsSensitiveData is true', () => {
      const result = wrapWithWarning('yt-dlp https://example.com', true);

      expect(result.command).toContain('WARNING');
      expect(result.command).toContain('Do not share');
      expect(result.containsSensitiveData).toBe(true);
    });

    test('no warning when containsSensitiveData is false', () => {
      const result = wrapWithWarning('yt-dlp https://example.com', false);

      expect(result.command).toBe('yt-dlp https://example.com');
      expect(result.command).not.toContain('WARNING');
      expect(result.containsSensitiveData).toBe(false);
    });
  });
});
