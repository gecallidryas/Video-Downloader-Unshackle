import type {
  AudioTrack,
  DashManifest,
  MediaVariant,
  ProtectionInfo,
  SubtitleTrack,
} from '@/video_downloader_types_skeleton';

export interface ParseMpdInput {
  manifestUrl: string;
  content: string;
}

export interface ParsedDashRepresentation {
  id: string;
  trackType: 'video' | 'audio' | 'text';
  initializationUrl?: string;
  mediaUrlTemplate?: string;
  startNumber: number;
  segmentDurationSec?: number;
  segmentCount: number;
}

export interface ParsedDashManifest extends DashManifest {
  representations: ParsedDashRepresentation[];
}

function hashId(input: string): string {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return `dash-${hash.toString(36)}`;
}

function resolveUrl(url: string | undefined, baseUrl: string): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function childrenByTag(element: Element, tagName: string): Element[] {
  return Array.from(element.children).filter(
    (child) => child.localName === tagName,
  );
}

function descendantsByTag(element: Element, tagName: string): Element[] {
  return Array.from(element.getElementsByTagNameNS('*', tagName));
}

function firstChildByTag(element: Element, tagName: string): Element | undefined {
  return childrenByTag(element, tagName)[0];
}

function attr(element: Element, name: string): string | undefined {
  return element.getAttribute(name) ?? undefined;
}

function numberAttr(element: Element, name: string): number | undefined {
  const value = attr(element, name);

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDuration(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(
    value,
  );

  if (!match) {
    return undefined;
  }

  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  );
}

function getContentType(adaptationSet: Element): 'video' | 'audio' | 'text' {
  const declared = attr(adaptationSet, 'contentType')?.toLowerCase();
  const mimeType = attr(adaptationSet, 'mimeType')?.toLowerCase();

  if (declared === 'audio' || mimeType?.startsWith('audio/')) {
    return 'audio';
  }

  if (
    declared === 'text' ||
    declared === 'subtitle' ||
    mimeType?.startsWith('text/') ||
    mimeType?.includes('ttml')
  ) {
    return 'text';
  }

  return 'video';
}

function replaceTemplateTokens(template: string, representationId: string): string {
  return template.replace(/\$RepresentationID\$/g, representationId);
}

function getSegmentTemplate(
  adaptationSet: Element,
  representation: Element,
): Element | undefined {
  return (
    firstChildByTag(representation, 'SegmentTemplate') ??
    firstChildByTag(adaptationSet, 'SegmentTemplate')
  );
}

function getBaseUrl(adaptationSet: Element, representation: Element): string | undefined {
  return (
    firstChildByTag(representation, 'BaseURL')?.textContent?.trim() ??
    firstChildByTag(adaptationSet, 'BaseURL')?.textContent?.trim()
  );
}

function detectProtection(documentElement: Element): ProtectionInfo {
  const protectionElements = descendantsByTag(documentElement, 'ContentProtection');

  if (protectionElements.length === 0) {
    return { kind: 'none' };
  }

  const drmSystems = protectionElements
    .flatMap((element) => [
      attr(element, 'value')?.toLowerCase(),
      attr(element, 'schemeIdUri')?.toLowerCase().includes('edef8ba9')
        ? 'widevine'
        : undefined,
      attr(element, 'schemeIdUri')?.toLowerCase().includes('9a04f079')
        ? 'playready'
        : undefined,
    ])
    .filter((value): value is string => Boolean(value));

  return {
    kind: 'drm',
    reason: 'DASH MPD declares ContentProtection.',
    drmSystems: Array.from(new Set(drmSystems)),
  };
}

function textFormatFromMime(mimeType: string | undefined): SubtitleTrack['format'] {
  if (mimeType?.includes('vtt')) {
    return 'vtt';
  }

  if (mimeType?.includes('ttml')) {
    return 'ttml';
  }

  return 'unknown';
}

function buildRepresentationMeta(
  adaptationSet: Element,
  representation: Element,
  manifestUrl: string,
  durationSec: number | undefined,
): ParsedDashRepresentation {
  const id = attr(representation, 'id') ?? `representation-${Date.now()}`;
  const trackType = getContentType(adaptationSet);
  const template = getSegmentTemplate(adaptationSet, representation);
  const baseUrl = getBaseUrl(adaptationSet, representation);
  const timescale = numberAttr(template ?? adaptationSet, 'timescale') ?? 1;
  const duration = numberAttr(template ?? adaptationSet, 'duration');
  const segmentDurationSec =
    duration !== undefined ? duration / Math.max(timescale, 1) : undefined;
  const segmentCount =
    segmentDurationSec && durationSec
      ? Math.ceil(durationSec / segmentDurationSec)
      : baseUrl
        ? 1
        : 0;
  const initializationTemplate = template
    ? attr(template, 'initialization')
    : undefined;
  const mediaTemplate = template ? attr(template, 'media') : undefined;

  return {
    id,
    trackType,
    initializationUrl: resolveUrl(
      initializationTemplate
        ? replaceTemplateTokens(initializationTemplate, id)
        : undefined,
      manifestUrl,
    ),
    mediaUrlTemplate: mediaTemplate
      ? resolveUrl(replaceTemplateTokens(mediaTemplate, id), manifestUrl)
      : resolveUrl(baseUrl, manifestUrl),
    startNumber: numberAttr(template ?? adaptationSet, 'startNumber') ?? 1,
    segmentDurationSec,
    segmentCount,
  };
}

export function parseMpd(input: ParseMpdInput): ParsedDashManifest {
  const parser = new DOMParser();
  const document = parser.parseFromString(input.content, 'application/xml');
  const root = document.documentElement;
  const durationSec = parseDuration(attr(root, 'mediaPresentationDuration'));
  const isLive = attr(root, 'type') === 'dynamic';
  const protection = detectProtection(root);
  const variants: MediaVariant[] = [];
  const audioTracks: AudioTrack[] = [];
  const subtitleTracks: SubtitleTrack[] = [];
  const representations: ParsedDashRepresentation[] = [];

  for (const adaptationSet of descendantsByTag(root, 'AdaptationSet')) {
    const trackType = getContentType(adaptationSet);
    const language = attr(adaptationSet, 'lang');
    const adaptationCodecs = attr(adaptationSet, 'codecs');
    const adaptationMimeType = attr(adaptationSet, 'mimeType');

    for (const representation of childrenByTag(adaptationSet, 'Representation')) {
      const id = attr(representation, 'id') ?? `representation-${representations.length + 1}`;
      const codecs = attr(representation, 'codecs') ?? adaptationCodecs;
      const bandwidth = numberAttr(representation, 'bandwidth');
      const representationMeta = buildRepresentationMeta(
        adaptationSet,
        representation,
        input.manifestUrl,
        durationSec,
      );

      representations.push(representationMeta);

      if (trackType === 'video') {
        variants.push({
          id,
          width: numberAttr(representation, 'width') ?? numberAttr(adaptationSet, 'width'),
          height:
            numberAttr(representation, 'height') ?? numberAttr(adaptationSet, 'height'),
          bitrate: bandwidth,
          codecs: codecs ? [codecs] : undefined,
          isDefault: variants.length === 0,
        });
      } else if (trackType === 'audio') {
        audioTracks.push({
          id,
          kind: 'audio',
          language,
          bitrate: bandwidth,
          codec: codecs,
        });
      } else {
        subtitleTracks.push({
          id,
          kind: 'subtitle',
          language,
          format: textFormatFromMime(adaptationMimeType),
          url: representationMeta.mediaUrlTemplate,
        });
      }
    }
  }

  return {
    id: hashId(input.manifestUrl),
    protocol: 'dash',
    sourceUrl: input.manifestUrl,
    isLive,
    durationSec,
    protection,
    variants,
    audioTracks,
    subtitleTracks,
    representations,
  };
}
