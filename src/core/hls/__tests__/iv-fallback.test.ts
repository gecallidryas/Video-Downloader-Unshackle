import { describe, expect, test } from 'vitest';
import { decryptAes128Segment } from '../decrypt-aes128-segment';

async function encryptAesCbc(
  plaintext: Uint8Array<ArrayBuffer>,
  key: Uint8Array<ArrayBuffer>,
  iv: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    'AES-CBC',
    false,
    ['encrypt'],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    plaintext,
  );

  return new Uint8Array(encrypted);
}

describe('AES-128 IV fallback', () => {
  test('decrypts with the media sequence number when IV is omitted', async () => {
    const key = new Uint8Array([
      0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
      0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
    ]);
    const plaintext = new TextEncoder().encode('sequence-iv-fallback');
    const iv = new Uint8Array(16);
    new DataView(iv.buffer).setUint32(12, 42);
    const encrypted = await encryptAesCbc(plaintext, key, iv);

    const decrypted = await decryptAes128Segment({
      encrypted,
      key,
      iv: undefined,
      mediaSequence: 42,
      protection: { kind: 'aes-128', method: 'AES-128' },
    });

    expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
  });
});
