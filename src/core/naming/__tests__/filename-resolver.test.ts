import { describe, expect, test } from 'vitest';
import {
  isEmptyLink,
  normalizeFilenameUnicode,
  parseContentDispositionFilename,
  resolveRichFilename,
} from '../filename-resolver';

describe('parseContentDispositionFilename', () => {
  test('extracts a quoted filename', () => {
    expect(
      parseContentDispositionFilename('attachment; filename="video.mp4"'),
    ).toBe('video.mp4');
  });

  test('extracts an unquoted filename', () => {
    expect(parseContentDispositionFilename('attachment; filename=video.mp4')).toBe(
      'video.mp4',
    );
  });

  test('prefers RFC 5987 filename* over plain filename', () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename=ascii.mp4; filename*=UTF-8''mov%C3%ADe.mp4",
      ),
    ).toBe('movíe.mp4');
  });

  test('handles UTF-8 percent-encoded filename* with language tag', () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename*=UTF-8'en'video%20clip.mp4",
      ),
    ).toBe('video clip.mp4');
  });

  test('returns undefined when header is missing or has no filename', () => {
    expect(parseContentDispositionFilename(undefined)).toBeUndefined();
    expect(parseContentDispositionFilename('')).toBeUndefined();
    expect(parseContentDispositionFilename('attachment')).toBeUndefined();
  });

  test('returns undefined for malformed filename*', () => {
    expect(
      parseContentDispositionFilename("attachment; filename*=broken"),
    ).toBeUndefined();
  });
});

describe('normalizeFilenameUnicode', () => {
  test('applies NFC to decomposed sequences', () => {
    const decomposed = 'é'; // e + combining acute
    expect(normalizeFilenameUnicode(decomposed)).toBe('é');
  });

  test('preserves already-precomposed characters', () => {
    expect(normalizeFilenameUnicode('é')).toBe('é');
  });

  test('normalizes CJK without altering visible characters', () => {
    const decomposed = 'ガ'; // ka + dakuten => ga (がガ)
    expect(normalizeFilenameUnicode(decomposed).normalize('NFC')).toBe(
      decomposed.normalize('NFC'),
    );
  });

  test('returns empty string for empty input', () => {
    expect(normalizeFilenameUnicode('')).toBe('');
  });
});

describe('isEmptyLink', () => {
  test('returns true for empty string', () => {
    expect(isEmptyLink('')).toBe(true);
  });

  test('returns true for hash-only', () => {
    expect(isEmptyLink('#')).toBe(true);
    expect(isEmptyLink('  #  ')).toBe(true);
  });

  test('returns true for whitespace-only', () => {
    expect(isEmptyLink('   ')).toBe(true);
  });

  test('returns true for javascript: void', () => {
    expect(isEmptyLink('javascript:void(0)')).toBe(true);
  });

  test('returns false for real URLs', () => {
    expect(isEmptyLink('https://example.com/video.mp4')).toBe(false);
    expect(isEmptyLink('/relative/path.mp4')).toBe(false);
  });
});

describe('resolveRichFilename', () => {
  test('uses {author} - {title} - {quality}.{extension} pattern', () => {
    expect(
      resolveRichFilename({
        author: 'Channel Name',
        title: 'Video Title',
        quality: '1080p',
        extension: 'mp4',
      }),
    ).toBe('Channel Name - Video Title - 1080p.mp4');
  });

  test('omits author when missing', () => {
    expect(
      resolveRichFilename({
        title: 'Video Title',
        quality: '720p',
        extension: 'mp4',
      }),
    ).toBe('Video Title - 720p.mp4');
  });

  test('omits quality when missing', () => {
    expect(
      resolveRichFilename({
        author: 'Channel',
        title: 'Video Title',
        extension: 'mp4',
      }),
    ).toBe('Channel - Video Title.mp4');
  });

  test('sanitizes filesystem-hostile characters', () => {
    expect(
      resolveRichFilename({
        author: 'A/B',
        title: 'C:D*E?F',
        quality: '1080p',
        extension: 'mp4',
      }),
    ).toBe('A_B - C_D_E_F - 1080p.mp4');
  });

  test('trims to 200 chars before extension', () => {
    const longTitle = 'A'.repeat(500);

    const result = resolveRichFilename({
      title: longTitle,
      extension: 'mp4',
    });

    expect(result.length).toBeLessThanOrEqual(204);
    expect(result.endsWith('.mp4')).toBe(true);
  });

  test('falls back through page title, URL filename, then "download"', () => {
    expect(
      resolveRichFilename({
        pageTitle: 'My Page',
        extension: 'mp4',
      }),
    ).toBe('My Page.mp4');

    expect(
      resolveRichFilename({
        url: 'https://example.com/some/path/clip.mp4',
        extension: 'mp4',
      }),
    ).toBe('clip.mp4');

    expect(resolveRichFilename({ extension: 'mp4' })).toBe('download.mp4');
  });

  test('applies NFC normalization to the produced filename', () => {
    const decomposed = 'é';
    const result = resolveRichFilename({
      title: decomposed,
      extension: 'mp4',
    });

    expect(result).toBe('é.mp4');
  });
});
