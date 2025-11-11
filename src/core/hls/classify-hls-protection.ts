import type { ProtectionInfo } from '@/video_downloader_types_skeleton';

type HlsAttributeMap = Record<string, string>;
export type HlsIvInput = string | number | Uint8Array | Uint32Array | undefined;

function parseAttributes(value: string): HlsAttributeMap {
  const attributes: HlsAttributeMap = {};
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const rawValue = match[2] ?? '';
    attributes[match[1] ?? ''] = rawValue.replace(/^"|"$/g, '');
  }

  return attributes;
}

export function normalizeIV(value: HlsIvInput): Uint8Array | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  const normalized = new Uint8Array(16);
  const view = new DataView(normalized.buffer);

  if (typeof value === 'number') {
    view.setUint32(12, value);
    return normalized;
  }

  if (value instanceof Uint32Array) {
    const words = Array.from(value).slice(-4);
    const offset = 4 - words.length;

    for (let index = 0; index < words.length; index += 1) {
      view.setUint32((offset + index) * 4, words[index] ?? 0);
    }

    return normalized;
  }

  const hex = value.replace(/^0x/i, '').padStart(32, '0').slice(-32);

  for (let index = 0; index < normalized.length; index += 1) {
    const byte = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    normalized[index] = Number.isFinite(byte) ? byte : 0;
  }

  return normalized;
}

function protectionFromKeyAttributes(attributes: HlsAttributeMap): ProtectionInfo {
  const method = attributes.METHOD;

  if (!method || method.toUpperCase() === 'NONE') {
    return { kind: 'none' };
  }

  if (method.toUpperCase() === 'AES-128') {
    return {
      kind: 'aes-128',
      method,
      ...(attributes.URI ? { keyUri: attributes.URI } : {}),
      ...(attributes.IV ? { iv: attributes.IV } : {}),
      reason: 'HLS manifest declares AES-128 clear-key encrypted segments.',
    };
  }

  if (method.toUpperCase() === 'SAMPLE-AES') {
    return {
      kind: 'sample-aes',
      method,
      ...(attributes.KEYFORMAT ? { keyFormat: attributes.KEYFORMAT } : {}),
      ...(attributes.URI ? { keyUri: attributes.URI } : {}),
      ...(attributes.IV ? { iv: attributes.IV } : {}),
      reason: 'HLS manifest declares encrypted media segments.',
    };
  }

  return {
    kind: 'unknown',
    method,
    ...(attributes.KEYFORMAT ? { keyFormat: attributes.KEYFORMAT } : {}),
    ...(attributes.URI ? { keyUri: attributes.URI } : {}),
    ...(attributes.IV ? { iv: attributes.IV } : {}),
    reason: 'HLS manifest declares an unknown encryption method.',
  };
}

export function classifyHlsProtection(lines: string[]): ProtectionInfo {
  const keyLine = lines.find((line) => line.startsWith('#EXT-X-KEY:'));
  const sessionKeyLine = lines.find((line) =>
    line.startsWith('#EXT-X-SESSION-KEY:'),
  );
  const line = keyLine ?? sessionKeyLine;

  if (!line) {
    return { kind: 'none' };
  }

  return protectionFromKeyAttributes(
    parseAttributes(
      line.slice(
        line.startsWith('#EXT-X-KEY:')
          ? '#EXT-X-KEY:'.length
          : '#EXT-X-SESSION-KEY:'.length,
      ),
    ),
  );
}
