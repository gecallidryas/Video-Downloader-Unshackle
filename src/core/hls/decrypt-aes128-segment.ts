import type { ProtectionInfo } from '@/video_downloader_types_skeleton';

export interface DecryptAes128SegmentInput {
  encrypted: Uint8Array;
  key: Uint8Array;
  iv?: string;
  mediaSequence: number;
  protection: ProtectionInfo;
}

function parseHexIv(value: string): Uint8Array {
  const hex = value.replace(/^0x/i, '');
  const bytes = new Uint8Array(16);

  for (let index = 0; index < bytes.length; index += 1) {
    const byte = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    bytes[index] = Number.isFinite(byte) ? byte : 0;
  }

  return bytes;
}

export function deriveHlsAes128Iv(
  explicitIv: string | undefined,
  mediaSequence: number,
): Uint8Array {
  if (explicitIv) {
    return parseHexIv(explicitIv);
  }

  const iv = new Uint8Array(16);
  new DataView(iv.buffer).setUint32(12, mediaSequence);

  return iv;
}

export async function decryptAes128Segment(
  input: DecryptAes128SegmentInput,
): Promise<Uint8Array> {
  if (input.protection.kind !== 'aes-128') {
    throw new Error('Only authorized AES-128 HLS segments can be decrypted.');
  }

  if (input.key.byteLength !== 16) {
    throw new Error('AES-128 HLS keys must be 16 bytes.');
  }

  const keyBytes = new Uint8Array(input.key);
  const encryptedBytes = new Uint8Array(input.encrypted);
  const ivBytes = new Uint8Array(deriveHlsAes128Iv(input.iv, input.mediaSequence));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC' },
    false,
    ['decrypt'],
  );
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-CBC',
      iv: ivBytes,
    },
    cryptoKey,
    encryptedBytes,
  );

  return new Uint8Array(decrypted);
}
