import { describe, expect, test } from 'vitest';
import { decryptAes128Segment, deriveHlsAes128Iv } from '../decrypt-aes128-segment';

async function encryptAesCbc(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(key),
    'AES-CBC',
    false,
    ['encrypt'],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: new Uint8Array(iv) },
    cryptoKey,
    new Uint8Array(plaintext),
  );

  return new Uint8Array(encrypted);
}

describe('decryptAes128Segment', () => {
  test('decrypts authorized AES-128 HLS segments with explicit IV values', async () => {
    const key = new Uint8Array([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
      0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    ]);
    const iv = '0x101112131415161718191a1b1c1d1e1f';
    const plaintext = new TextEncoder().encode('authorized-clear-hls-segment');
    const encrypted = await encryptAesCbc(plaintext, key, deriveHlsAes128Iv(iv, 5));

    const decrypted = await decryptAes128Segment({
        encrypted,
        key,
        iv,
        mediaSequence: 5,
        protection: { kind: 'aes-128', method: 'AES-128' },
      });

    expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
  });

  test('uses sequence-number IVs when the manifest omits an explicit IV', () => {
    expect(Array.from(deriveHlsAes128Iv(undefined, 258))).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2,
    ]);
  });

  test('rejects DRM and unknown protection kinds before decrypting', async () => {
    await expect(
      decryptAes128Segment({
        encrypted: new Uint8Array(16),
        key: new Uint8Array(16),
        mediaSequence: 0,
        protection: { kind: 'drm' },
      }),
    ).rejects.toThrow('Only authorized AES-128 HLS segments can be decrypted.');
  });
});
