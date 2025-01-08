import type {
  DetectionEvidence,
  MediaKind,
  StreamProtocol,
} from '@/video_downloader_types_skeleton';

export type RequestCategory =
  | 'direct_media'
  | 'hls_manifest'
  | 'dash_manifest'
  | 'subtitle'
  | 'segment'
  | 'unknown';

export interface RequestHeaderLike {
  name: string;
  value?: string;
}

export interface RequestLike {
  url: string;
  initiator?: string;
  frameId?: number;
  requestId?: string;
  method?: string;
  type?: string;
  timeStamp?: number;
  responseHeaders?: RequestHeaderLike[];
}

export interface RequestClassification {
  category: RequestCategory;
  protocol: StreamProtocol;
  mediaKind?: MediaKind;
  url: string;
  initiatorUrl?: string;
  mimeType?: string;
  fileExtensionHint?: string;
  evidence: DetectionEvidence;
}

const hlsMimeTypes = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
]);

const dashMimeTypes = new Set(['application/dash+xml']);
const videoMimePrefix = 'video/';
const audioMimePrefix = 'audio/';
const subtitleMimeTypes = new Set([
  'text/vtt',
  'application/x-subrip',
  'application/ttml+xml',
  'application/ttaf+xml',
]);

const videoExtensions = new Set(['mp4', 'm4v', 'webm', 'mkv', 'mov']);
const audioExtensions = new Set(['mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wav']);
const subtitleExtensions = new Set(['vtt', 'srt', 'ttml', 'dfxp']);
const segmentExtensions = new Set(['m4s', 'cmfv', 'cmfa', 'm2ts', 'ts']);

function getHeaderValue(
  headers: RequestHeaderLike[] | undefined,
  headerName: string,
): string | undefined {
  return headers?.find(
    (header) => header.name.toLowerCase() === headerName.toLowerCase(),
  )?.value;
}

function normalizeMimeType(value: string | undefined): string | undefined {
  return value?.split(';', 1)[0]?.trim().toLowerCase() || undefined;
}

function getExtension(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split('/').pop() ?? '';
    const extension = lastSegment.includes('.')
      ? lastSegment.split('.').pop()
      : undefined;

    return extension?.toLowerCase();
  } catch {
    const pathWithoutQuery = url.split(/[?#]/, 1)[0] ?? '';
    const extension = pathWithoutQuery.includes('.')
      ? pathWithoutQuery.split('.').pop()
      : undefined;

    return extension?.toLowerCase();
  }
}

function isSegmentPath(url: string, extension: string | undefined): boolean {
  if (!extension || !segmentExtensions.has(extension)) {
    return false;
  }

  if (extension !== 'ts') {
    return true;
  }

  return /(?:^|[/._-])(?:seg|segment|chunk|part|frag|fragment|media)[/._-]?\d*/i.test(
    url,
  );
}

function buildEvidence(
  request: RequestLike,
  category: RequestCategory,
): DetectionEvidence {
  return {
    source: 'network',
    confidence: category === 'unknown' ? 0.1 : 0.75,
    url: request.url,
    initiatorUrl: request.initiator,
    notes: [`category:${category}`],
    createdAt: request.timeStamp ?? Date.now(),
  };
}

export function classifyRequest(request: RequestLike): RequestClassification {
  const extension = getExtension(request.url);
  const mimeType = normalizeMimeType(
    getHeaderValue(request.responseHeaders, 'content-type'),
  );

  let category: RequestCategory = 'unknown';
  let protocol: StreamProtocol = 'unknown';
  let mediaKind: MediaKind | undefined;

  if (extension === 'm3u8' || (mimeType && hlsMimeTypes.has(mimeType))) {
    category = 'hls_manifest';
    protocol = 'hls';
    mediaKind = 'video';
  } else if (extension === 'mpd' || (mimeType && dashMimeTypes.has(mimeType))) {
    category = 'dash_manifest';
    protocol = 'dash';
    mediaKind = 'video';
  } else if (
    (extension && subtitleExtensions.has(extension)) ||
    (mimeType && subtitleMimeTypes.has(mimeType))
  ) {
    category = 'subtitle';
    protocol = 'direct';
    mediaKind = 'subtitle';
  } else if (isSegmentPath(request.url, extension)) {
    category = 'segment';
    protocol = 'unknown';
  } else if (
    (extension && videoExtensions.has(extension)) ||
    mimeType?.startsWith(videoMimePrefix)
  ) {
    category = 'direct_media';
    protocol = 'direct';
    mediaKind = 'video';
  } else if (
    (extension && audioExtensions.has(extension)) ||
    mimeType?.startsWith(audioMimePrefix)
  ) {
    category = 'direct_media';
    protocol = 'direct';
    mediaKind = 'audio';
  }

  return {
    category,
    protocol,
    mediaKind,
    url: request.url,
    initiatorUrl: request.initiator,
    mimeType,
    fileExtensionHint: extension,
    evidence: buildEvidence(request, category),
  };
}
