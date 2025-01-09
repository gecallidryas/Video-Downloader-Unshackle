import type { ProtectionInfo } from '@/video_downloader_types_skeleton';

type HlsAttributeMap = Record<string, string>;

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

  if (!keyLine) {
    return { kind: 'none' };
  }

  return protectionFromKeyAttributes(
    parseAttributes(keyLine.slice('#EXT-X-KEY:'.length)),
  );
}
