import type {
  DetectionEvidence,
  MediaKind,
  StreamProtocol,
} from '@/video_downloader_types_skeleton';

export type RequestCategory =
  | 'direct_media'
  | 'hls_manifest'
  | 'dash_manifest'
  | 'hds_manifest'
  | 'mss_manifest'
  | 'license'
  | 'subtitle'
  | 'subtitle_vtt'
  | 'subtitle_srt'
  | 'subtitle_ttml'
  | 'subtitle_dfxp'
  | 'segment'
  | 'ignored'
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
  'application/mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
]);

const dashMimeTypes = new Set([
  'application/dash+xml',
  'video/vnd.mpeg.dash.mpd',
]);
const hdsMimeTypes = new Set([
  'application/f4m+xml',
]);
const mssMimeTypes = new Set([
  'application/vnd.ms-sstr+xml',
]);
const videoMimePrefix = 'video/';
const audioMimePrefix = 'audio/';
const subtitleMimeTypes = new Set([
  'text/vtt',
  'application/x-subrip',
  'application/ttml+xml',
  'application/ttaf+xml',
]);
const subtitleCategoryByExtension = new Map<string, RequestCategory>([
  ['vtt', 'subtitle_vtt'],
  ['srt', 'subtitle_srt'],
  ['ttml', 'subtitle_ttml'],
  ['dfxp', 'subtitle_dfxp'],
]);
const subtitleCategoryByMimeType = new Map<string, RequestCategory>([
  ['text/vtt', 'subtitle_vtt'],
  ['application/x-subrip', 'subtitle_srt'],
  ['application/ttml+xml', 'subtitle_ttml'],
  ['application/ttaf+xml', 'subtitle_dfxp'],
]);

const videoExtensions = new Set(['mp4', 'm4v', 'webm', 'mkv', 'mov', 'ogv', 'flv']);
const audioExtensions = new Set(['mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wav', 'oga', 'weba']);
const subtitleExtensions = new Set(['vtt', 'srt', 'ttml', 'dfxp']);
const segmentExtensions = new Set(['m4s', 'cmfv', 'cmfa', 'm2ts', 'm2t', 'ts']);
const segmentMimeTypes = new Set(['video/mp2t']);
const licenseUrlPatterns = [
  /widevine/i,
  /playready/i,
  /fairplay/i,
  /licens/i,
  /drm/i,
  /certificate/i,
];

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

function isAdaptiveComponentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const isTwitterCdn =
      host === 'video.twimg.com' || host.endsWith('.twimg.com');

    return (
      isTwitterCdn &&
      (path.includes('/pu/aud/') ||
        path.includes('/pu/vid/') ||
        path.includes('/aud/mp4a/') ||
        path.includes('/vid/avc1/') ||
        path.includes('/vid/hevc/'))
    );
  } catch {
    return false;
  }
}

function isMssManifestPath(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.ism\/manifest/i.test(pathname);
  } catch {
    return /\.ism\/manifest/i.test(url.toLowerCase());
  }
}

function isLicenseRequest(url: string): boolean {
  return licenseUrlPatterns.some((pattern) => pattern.test(url));
}

function getDrmSystemsFromUrl(url: string): string[] {
  const lower = url.toLowerCase();
  const systems = new Set<string>();

  if (
    lower.includes('widevine') ||
    lower.includes('edef8ba9-79d6-4ace-a3c8-27dcd51d21ed')
  ) {
    systems.add('widevine');
  }
  if (
    lower.includes('playready') ||
    lower.includes('9a04f079-9840-4286-ab92-e65be0885f95')
  ) {
    systems.add('playready');
  }
  if (
    lower.includes('fairplay') ||
    lower.includes('com.apple.fps') ||
    lower.startsWith('skd://') ||
    lower.includes('94ce86fb-07ff-4f43-adb8-93d2fa968ca2')
  ) {
    systems.add('fairplay');
  }

  return systems.size > 0 ? Array.from(systems) : ['drm'];
}

function buildEvidence(
  request: RequestLike,
  category: RequestCategory,
  extraNotes: string[] = [],
): DetectionEvidence {
  return {
    source: 'network',
    confidence: category === 'unknown' ? 0.1 : 0.75,
    url: request.url,
    initiatorUrl: request.initiator,
    notes: [`category:${category}`, ...extraNotes],
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
  let extraNotes: string[] = [];

  if (isAdaptiveComponentUrl(request.url)) {
    category = 'ignored';
  } else if (
    extension === 'm3u8' ||
    extension === 'm3u' ||
    (mimeType && hlsMimeTypes.has(mimeType))
  ) {
    category = 'hls_manifest';
    protocol = 'hls';
    mediaKind = 'video';
  } else if (extension === 'mpd' || (mimeType && dashMimeTypes.has(mimeType))) {
    category = 'dash_manifest';
    protocol = 'dash';
    mediaKind = 'video';
    if (isLicenseRequest(request.url)) {
      extraNotes = getDrmSystemsFromUrl(request.url).map((system) => `drm:${system}`);
    }
  } else if (extension === 'f4m' || (mimeType && hdsMimeTypes.has(mimeType))) {
    category = 'hds_manifest';
    protocol = 'hds';
    mediaKind = 'video';
  } else if (isMssManifestPath(request.url) || (mimeType && mssMimeTypes.has(mimeType))) {
    category = 'mss_manifest';
    protocol = 'mss';
    mediaKind = 'video';
  } else if (isLicenseRequest(request.url)) {
    category = 'license';
    extraNotes = [
      'license-request:true',
      ...getDrmSystemsFromUrl(request.url).map((system) => `drm:${system}`),
    ];
  } else if (
    (extension && subtitleExtensions.has(extension)) ||
    (mimeType && subtitleMimeTypes.has(mimeType))
  ) {
    category =
      (extension ? subtitleCategoryByExtension.get(extension) : undefined) ??
      (mimeType ? subtitleCategoryByMimeType.get(mimeType) : undefined) ??
      'subtitle';
    protocol = 'direct';
    mediaKind = 'subtitle';
  } else if (
    isSegmentPath(request.url, extension) ||
    (mimeType && segmentMimeTypes.has(mimeType))
  ) {
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
    evidence: buildEvidence(request, category, extraNotes),
  };
}
