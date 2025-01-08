import type {
  DetectionEvidence,
  MediaKind,
} from '@/video_downloader_types_skeleton';

export interface MediaSourceEvidence {
  url: string;
  mimeType?: string;
}

export interface MediaTrackEvidence {
  kind?: string;
  label?: string;
  language?: string;
  url?: string;
}

export interface DomMediaElementEvidence extends DetectionEvidence {
  source: 'dom';
  mediaKind: Extract<MediaKind, 'video' | 'audio'>;
  pageUrl: string;
  pageTitle?: string;
  posterUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  sources: MediaSourceEvidence[];
  tracks: MediaTrackEvidence[];
}

export interface ScanMediaElementsOptions {
  now?: () => number;
  pageUrl?: string;
}

function resolveUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function getPageUrl(documentRef: Document, options: ScanMediaElementsOptions) {
  return options.pageUrl ?? documentRef.location?.href ?? '';
}

function getElementSelector(element: HTMLMediaElement): string {
  const tagName = element.tagName.toLowerCase();

  if (element.id) {
    return `${tagName}#${CSS.escape(element.id)}`;
  }

  const mediaElements = Array.from(
    element.ownerDocument.querySelectorAll(tagName),
  );
  const index = mediaElements.indexOf(element) + 1;

  return `${tagName}:nth-of-type(${index})`;
}

function collectSources(
  element: HTMLMediaElement,
  pageUrl: string,
): MediaSourceEvidence[] {
  const directSource = element.getAttribute('src');
  const childSources = Array.from(element.querySelectorAll('source')).map(
    (source) => ({
      url: resolveUrl(source.getAttribute('src') ?? '', pageUrl),
      mimeType: source.getAttribute('type') ?? undefined,
    }),
  );

  return [
    ...(directSource ? [{ url: resolveUrl(directSource, pageUrl) }] : []),
    ...childSources.filter((source) => source.url),
  ];
}

function collectTracks(
  element: HTMLMediaElement,
  pageUrl: string,
): MediaTrackEvidence[] {
  return Array.from(element.querySelectorAll('track')).map((track) => ({
    kind: track.getAttribute('kind') ?? undefined,
    label: track.getAttribute('label') ?? undefined,
    language: track.getAttribute('srclang') ?? undefined,
    url: track.getAttribute('src')
      ? resolveUrl(track.getAttribute('src') ?? '', pageUrl)
      : undefined,
  }));
}

function getElementDuration(element: HTMLMediaElement): number | undefined {
  return Number.isFinite(element.duration) && element.duration > 0
    ? element.duration
    : undefined;
}

function getElementSize(element: HTMLMediaElement): {
  width?: number;
  height?: number;
} {
  const widthAttribute = Number(element.getAttribute('width'));
  const heightAttribute = Number(element.getAttribute('height'));

  if (element instanceof HTMLVideoElement) {
    return {
      width: element.videoWidth || widthAttribute || undefined,
      height: element.videoHeight || heightAttribute || undefined,
    };
  }

  return {};
}

function toMediaEvidence(
  element: HTMLMediaElement,
  options: ScanMediaElementsOptions,
): DomMediaElementEvidence | undefined {
  const documentRef = element.ownerDocument;
  const pageUrl = getPageUrl(documentRef, options);
  const sources = collectSources(element, pageUrl);
  const primarySource = sources[0];

  if (!primarySource) {
    return undefined;
  }

  const mediaKind: Extract<MediaKind, 'video' | 'audio'> =
    element instanceof HTMLAudioElement ? 'audio' : 'video';
  const { width, height } = getElementSize(element);
  const poster = element.getAttribute('poster');

  return {
    source: 'dom',
    confidence: 0.85,
    url: primarySource.url,
    elementSelector: getElementSelector(element),
    notes: [`tag:${element.tagName.toLowerCase()}`],
    createdAt: options.now?.() ?? Date.now(),
    mediaKind,
    pageUrl,
    pageTitle: documentRef.title || undefined,
    posterUrl: poster ? resolveUrl(poster, pageUrl) : undefined,
    mimeType: primarySource.mimeType,
    width,
    height,
    durationSec: getElementDuration(element),
    sources,
    tracks: collectTracks(element, pageUrl),
  };
}

export function scanMediaElements(
  root: ParentNode = document,
  options: ScanMediaElementsOptions = {},
): DomMediaElementEvidence[] {
  return Array.from(root.querySelectorAll('video, audio'))
    .map((element) =>
      toMediaEvidence(element as HTMLMediaElement, options),
    )
    .filter((evidence): evidence is DomMediaElementEvidence => Boolean(evidence));
}
