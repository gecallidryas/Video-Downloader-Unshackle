import type { ProtectionInfo } from '@/video_downloader_types_skeleton';
import { normalizeIV, type HlsIvInput } from './classify-hls-protection';

export interface DecryptAes128SegmentInput {
  encrypted: Uint8Array;
  key: Uint8Array;
  iv?: HlsIvInput;
  mediaSequence: number;
  protection: ProtectionInfo;
}

export function deriveHlsAes128Iv(
  explicitIv: HlsIvInput,
  mediaSequence: number,
): Uint8Array {
  const normalized = normalizeIV(explicitIv);

  if (normalized) {
    return normalized;
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
