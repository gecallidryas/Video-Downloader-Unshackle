import type { MediaKind, StreamProtocol } from '@/video_downloader_types_skeleton';

export interface BlobMediaDiagnostic {
  url: string;
  type: string;
  protocol: Extract<StreamProtocol, 'hls' | 'dash'>;
  mediaKind: Extract<MediaKind, 'video' | 'audio'>;
  elementSelector: string;
  createdAt: number;
}

export interface DetectBlobMediaOptions {
  advancedMode?: boolean;
  now?: () => number;
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

function getProtocol(type: string | undefined): Extract<StreamProtocol, 'hls' | 'dash'> | undefined {
  const normalized = type?.split(';', 1)[0]?.trim().toLowerCase();

  if (normalized && hlsMimeTypes.has(normalized)) {
    return 'hls';
  }

  if (normalized && dashMimeTypes.has(normalized)) {
    return 'dash';
  }

  return undefined;
}

export interface MseActivitySignal {
  usingMediaSource: true;
  sourceMimeType?: string;
  protocol?: Extract<StreamProtocol, 'hls' | 'dash'>;
}

// Connects the MAIN-world MediaSource/appendBuffer hook to detection: blob:/MSE
// players never expose a fetchable manifest URL here, so we surface only that MSE
// is in use plus the buffered source mime, letting the UI/native path take over.
export function classifyMseActivity(
  mimeType: string | undefined,
): MseActivitySignal {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase() || undefined;

  return {
    usingMediaSource: true,
    sourceMimeType: normalized,
    protocol: getProtocol(mimeType),
  };
}

function getElementSelector(element: HTMLMediaElement): string {
  const tagName = element.tagName.toLowerCase();

  if (element.id) {
    return `${tagName}#${CSS.escape(element.id)}`;
  }

  const siblings = Array.from(element.ownerDocument.querySelectorAll(tagName));
  const index = siblings.indexOf(element) + 1;

  return `${tagName}:nth-of-type(${index})`;
}

function collectElementSources(element: HTMLMediaElement): Array<{ url: string; type?: string }> {
  const directSrc = element.getAttribute('src');
  const directType = element.getAttribute('type') ?? undefined;
  const childSources = Array.from(element.querySelectorAll('source')).map((source) => ({
    url: source.getAttribute('src') ?? '',
    type: source.getAttribute('type') ?? undefined,
  }));

  return [
    ...(directSrc ? [{ url: directSrc, type: directType }] : []),
    ...childSources,
  ];
}

export function detectBlobMedia(
  root: ParentNode = document,
  options: DetectBlobMediaOptions = {},
): BlobMediaDiagnostic[] {
  if (!options.advancedMode) {
    return [];
  }

  try {
    const now = options.now ?? (() => Date.now());
    const diagnostics: BlobMediaDiagnostic[] = [];

    for (const element of Array.from(root.querySelectorAll('video, audio'))) {
      const mediaElement = element as HTMLMediaElement;
      const mediaKind: Extract<MediaKind, 'video' | 'audio'> =
        mediaElement instanceof HTMLAudioElement ? 'audio' : 'video';

      for (const source of collectElementSources(mediaElement)) {
        const protocol = getProtocol(source.type);

        if (!source.url.startsWith('blob:') || !source.type || !protocol) {
          continue;
        }

        diagnostics.push({
          url: source.url,
          type: source.type,
          protocol,
          mediaKind,
          elementSelector: getElementSelector(mediaElement),
          createdAt: now(),
        });
      }
    }

    return diagnostics;
  } catch {
    return [];
  }
}
