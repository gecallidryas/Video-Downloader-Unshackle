import { describe, expect, test } from 'vitest';
import { classifyHlsProtection, normalizeIV } from '../classify-hls-protection';

describe('HLS IV normalization', () => {
  test('normalizes hex string IV to Uint8Array', () => {
    expect(normalizeIV('0x00000000000000000000000000000001')).toEqual(
      new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
    );
  });

  test('passes through Uint8Array IV unchanged', () => {
    const iv = new Uint8Array(16);

    expect(normalizeIV(iv)).toBe(iv);
  });

  test('normalizes number IV to big-endian Uint8Array', () => {
    const expected = new Uint8Array(16);
    new DataView(expected.buffer).setUint32(12, 42);

    expect(normalizeIV(42)).toEqual(expected);
  });

  test('normalizes Uint32Array IV to big-endian Uint8Array words', () => {
    expect(normalizeIV(new Uint32Array([0, 0, 0, 42]))).toEqual(
      new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 42]),
    );
  });
});

describe('HLS session key classification', () => {
  test('detects SESSION-KEY in manifest protection', () => {
    const protection = classifyHlsProtection([
      '#EXTM3U',
      '#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://keys.example/key"',
      '#EXT-X-STREAM-INF:BANDWIDTH=800000',
      'video.m3u8',
    ]);

    expect(protection).toEqual({
      kind: 'aes-128',
      method: 'AES-128',
      keyUri: 'https://keys.example/key',
      reason: 'HLS manifest declares AES-128 clear-key encrypted segments.',
    });
  });
});
