import type { DetectionEvidence } from '@/video_downloader_types_skeleton';

export interface ManualHlsIngestInput {
  input: string;
  pageUrl: string;
  pageTitle?: string;
  baseUrl?: string;
  now?: () => number;
}

const hlsUrlPattern = /https?:\/\/[^\s"'<>]+?\.m3u8(?:\?[^\s"'<>]*)?/gi;
const segmentPattern = /\.(?:ts|m2ts|m2t|m4s)(?:[?#].*)?$/i;

function cleanUrl(value: string): string {
  return value.trim().replace(/[),.;\]}]+$/, '');
}

function resolveUrl(value: string, baseUrl: string | undefined): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  if (!baseUrl) {
    return trimmed;
  }

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

function toManifestDataUrl(content: string): string {
  return `data:application/vnd.apple.mpegurl;charset=utf-8,${encodeURIComponent(content)}`;
}

function normalizeRawManifest(input: string, baseUrl: string | undefined): string {
  return input
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }

      return resolveUrl(trimmed, baseUrl);
    })
    .join('\n');
}

function rawSegmentListToManifest(input: string, baseUrl: string | undefined): string | undefined {
  const urls = input
    .split(/\r?\n/)
    .map((line) => cleanUrl(line))
    .filter((line) => line && !line.startsWith('#') && segmentPattern.test(line))
    .map((line) => resolveUrl(line, baseUrl));

  if (urls.length === 0) {
    return undefined;
  }

  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    ...urls.flatMap((url) => ['#EXTINF:6,', url]),
    '#EXT-X-ENDLIST',
  ].join('\n');
}

function buildEvidence(input: {
  url: string;
  pageUrl: string;
  pageTitle?: string;
  mode: string;
  now: () => number;
}): DetectionEvidence {
  return {
    source: 'user',
    confidence: 0.9,
    url: input.url,
    initiatorUrl: input.pageUrl,
    notes: [
      'protocol:hls',
      `manual-ingest:${input.mode}`,
      ...(input.pageTitle ? [`title:${input.pageTitle}`] : []),
      `manifest-url:${input.url}`,
    ],
    createdAt: input.now(),
  };
}

export function createManualHlsIngestEvidence(
  input: ManualHlsIngestInput,
): DetectionEvidence[] {
  const now = input.now ?? (() => Date.now());
  const rawInput = input.input.trim();

  if (!rawInput) {
    throw new Error('Manual HLS ingest requires input.');
  }

  const urls = Array.from(rawInput.matchAll(hlsUrlPattern), (match) => cleanUrl(match[0]));
  if (urls.length > 0) {
    return Array.from(new Set(urls)).map((url) =>
      buildEvidence({
        url,
        pageUrl: input.pageUrl,
        pageTitle: input.pageTitle,
        mode: 'url',
        now,
      }),
    );
  }

  if (rawInput.startsWith('#EXTM3U')) {
    const manifest = normalizeRawManifest(rawInput, input.baseUrl);

    return [
      buildEvidence({
        url: toManifestDataUrl(manifest),
        pageUrl: input.pageUrl,
        pageTitle: input.pageTitle,
        mode: 'manifest-text',
        now,
      }),
    ];
  }

  const generatedManifest = rawSegmentListToManifest(rawInput, input.baseUrl);
  if (generatedManifest) {
    return [
      buildEvidence({
        url: toManifestDataUrl(generatedManifest),
        pageUrl: input.pageUrl,
        pageTitle: input.pageTitle,
        mode: 'raw-ts-list',
        now,
      }),
    ];
  }

  throw new Error('Manual HLS ingest could not find an HLS URL, manifest, or segment list.');
}
