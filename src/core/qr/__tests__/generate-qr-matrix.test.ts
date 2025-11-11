import { describe, expect, test } from 'vitest';
import {
  generateQrMatrix,
  isUrlSafeForQr,
} from '../generate-qr-matrix';

describe('generate-qr-matrix', () => {
  test('returns a square boolean grid', () => {
    const matrix = generateQrMatrix('https://example.com/video');
    expect(Array.isArray(matrix)).toBe(true);
    expect(matrix.length).toBeGreaterThan(0);
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
    for (const row of matrix) {
      for (const cell of row) {
        expect(typeof cell).toBe('boolean');
      }
    }
  });

  test('throws for empty input', () => {
    expect(() => generateQrMatrix('')).toThrow();
  });

  test('different inputs produce different matrices', () => {
    const a = generateQrMatrix('https://a.example/x');
    const b = generateQrMatrix('https://b.example/y');
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  test('isUrlSafeForQr rejects URLs with cookie/auth-bearing query params', () => {
    expect(isUrlSafeForQr('https://example.com/v?Authorization=Bearer+xyz')).toBe(false);
    expect(isUrlSafeForQr('https://example.com/v?token=abc')).toBe(false);
    expect(isUrlSafeForQr('https://example.com/v?cookie=sek')).toBe(false);
    expect(isUrlSafeForQr('https://example.com/v?sig=abc&Expires=999')).toBe(false);
    expect(isUrlSafeForQr('https://example.com/v?x-amz-signature=abc')).toBe(false);
  });

  test('isUrlSafeForQr accepts plain URLs', () => {
    expect(isUrlSafeForQr('https://example.com/video.mp4')).toBe(true);
    expect(isUrlSafeForQr('https://example.com/path/to/v.m3u8?bitrate=high')).toBe(true);
  });

  test('isUrlSafeForQr rejects malformed URL', () => {
    expect(isUrlSafeForQr('not a url')).toBe(false);
  });
});
