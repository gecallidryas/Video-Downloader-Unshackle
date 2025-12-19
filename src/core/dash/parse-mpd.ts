import type {
  AudioTrack,
  DashManifest,
  MediaVariant,
  ProtectionInfo,
  SubtitleTrack,
} from '@/video_downloader_types_skeleton';
import { classifyDashProtection } from './classify-dash-protection';

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
  timeline?: DashTimelineSegment[];
  explicitSegments?: ParsedDashExplicitSegment[];
}

export interface DashTimelineSegment {
  time: number;
  durationSec?: number;
}

export interface ParsedDashExplicitSegment {
  url: string;
  byteRange?: { start: number; end: number };
  durationSec?: number;
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

function resolveBaseUrl(
  element: Element | undefined,
  baseUrl: string,
): string {
  const base = element ? firstChildByTag(element, 'BaseURL')?.textContent?.trim() : undefined;

  return resolveUrl(base, baseUrl) ?? baseUrl;
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

class MinimalXmlElement {
  readonly localName: string;
  readonly attributes: Map<string, string>;
  readonly childElements: MinimalXmlElement[] = [];
  readonly textParts: string[] = [];

  constructor(localName: string, attributes: Map<string, string>) {
    this.localName = localName;
    this.attributes = attributes;
  }

  get children(): Element[] {
    return this.childElements.map((child) => child.asElement());
  }

  get textContent(): string {
    return [
      ...this.textParts,
      ...this.childElements.map((child) => child.textContent),
    ].join('');
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  getElementsByTagNameNS(_namespace: string, tagName: string): Element[] {
    return this.childElements.flatMap((child) => {
      const descendants = child.getElementsByTagNameNS(_namespace, tagName);

      return child.localName === tagName
        ? [child.asElement(), ...descendants]
        : descendants;
    });
  }

  asElement(): Element {
    return this as unknown as Element;
  }
}

function localNameFor(rawName: string): string {
  return rawName.split(':').pop() ?? rawName;
}

function parseAttributes(rawTag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(rawTag)) !== null) {
    attributes.set(match[1] ?? '', match[3] ?? match[4] ?? '');
  }

  return attributes;
}

function parseXmlFallback(content: string): Element {
  const tokens = content.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g) ?? [];
  const stack: MinimalXmlElement[] = [];
  let root: MinimalXmlElement | undefined;

  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<?')) {
      continue;
    }

    if (token.startsWith('<![CDATA[')) {
      stack[stack.length - 1]?.textParts.push(token.slice(9, -3));
      continue;
    }

    if (token.startsWith('</')) {
      stack.pop();
      continue;
    }

    if (token.startsWith('<')) {
      if (token.startsWith('<!')) {
        continue;
      }

      const selfClosing = /\/\s*>$/.test(token);
      const rawTag = token.slice(1, selfClosing ? -2 : -1).trim();
      const rawName = rawTag.split(/\s+/, 1)[0] ?? '';
      const element = new MinimalXmlElement(localNameFor(rawName), parseAttributes(rawTag));
      const parent = stack[stack.length - 1];

      if (parent) {
        parent.childElements.push(element);
      } else {
        root = element;
      }

      if (!selfClosing) {
        stack.push(element);
      }

      continue;
    }

    stack[stack.length - 1]?.textParts.push(token);
  }

  if (!root) {
    throw new Error('DASH MPD did not contain a document element.');
  }

  return root.asElement();
}

function parseMpdRoot(content: string): Element {
  if (typeof DOMParser === 'function') {
    return new DOMParser().parseFromString(content, 'application/xml').documentElement;
  }

  return parseXmlFallback(content);
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

  const match = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
    value,
  );

  if (!match) {
    return undefined;
  }

  return (
    Number(match[1] ?? 0) * 86400 +
    Number(match[2] ?? 0) * 3600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0)
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
  return firstChildByTag(representation, 'BaseURL')?.textContent?.trim();
}

function detectProtection(documentElement: Element): ProtectionInfo {
  return classifyDashProtection(documentElement);
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
  baseUrl: string,
  durationSec: number | undefined,
): ParsedDashRepresentation {
  const id = attr(representation, 'id') ?? `representation-${Date.now()}`;
  const trackType = getContentType(adaptationSet);
  const template = getSegmentTemplate(adaptationSet, representation);
  const representationBaseUrl = resolveUrl(
    getBaseUrl(adaptationSet, representation),
    baseUrl,
  );
  const hasSegmentBaseUrl = Boolean(
    representationBaseUrl ?? firstChildByTag(adaptationSet, 'BaseURL'),
  );
  const segmentList =
    firstChildByTag(representation, 'SegmentList') ??
    firstChildByTag(adaptationSet, 'SegmentList');
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
  const timeline = template ? parseSegmentTimeline(template, timescale) : undefined;
  const explicitSegments = segmentList
    ? parseSegmentList(segmentList, representationBaseUrl ?? baseUrl)
    : undefined;
  const explicitSegmentDurationSec =
    numberAttr(segmentList ?? adaptationSet, 'duration') !== undefined
      ? (numberAttr(segmentList ?? adaptationSet, 'duration') ?? 0) /
        Math.max(numberAttr(segmentList ?? adaptationSet, 'timescale') ?? 1, 1)
      : undefined;

  return {
    id,
    trackType,
    initializationUrl: resolveUrl(
      segmentList
        ? firstChildByTag(segmentList, 'Initialization')?.getAttribute('sourceURL') ??
            undefined
        : initializationTemplate
        ? replaceTemplateTokens(initializationTemplate, id)
        : undefined,
      representationBaseUrl ?? baseUrl,
    ),
    mediaUrlTemplate: mediaTemplate
      ? resolveUrl(replaceTemplateTokens(mediaTemplate, id), representationBaseUrl ?? baseUrl)
      : hasSegmentBaseUrl
        ? (representationBaseUrl ?? baseUrl)
        : undefined,
    startNumber: numberAttr(template ?? adaptationSet, 'startNumber') ?? 1,
    segmentDurationSec,
    segmentCount: timeline?.length ?? explicitSegments?.length ?? segmentCount,
    timeline,
    explicitSegments: explicitSegments?.map((segment) => ({
      ...segment,
      durationSec: segment.durationSec ?? explicitSegmentDurationSec,
    })),
  };
}

function parseByteRange(value: string | undefined): { start: number; end: number } | undefined {
  if (!value) {
    return undefined;
  }

  const [startRaw, endRaw] = value.split('-');
  const start = Number(startRaw);
  const end = Number(endRaw);

  return Number.isFinite(start) && Number.isFinite(end)
    ? { start, end }
    : undefined;
}

function parseSegmentTimeline(
  template: Element,
  timescale: number,
): DashTimelineSegment[] | undefined {
  const timeline = firstChildByTag(template, 'SegmentTimeline');

  if (!timeline) {
    return undefined;
  }

  const segments: DashTimelineSegment[] = [];
  let currentTime = 0;

  const sElements = childrenByTag(timeline, 'S');

  for (let si = 0; si < sElements.length; si += 1) {
    const item = sElements[si]!;
    const duration = numberAttr(item, 'd');
    const explicitTime = numberAttr(item, 't');
    const repeat = numberAttr(item, 'r') ?? 0;

    if (duration === undefined) {
      continue;
    }

    if (explicitTime !== undefined) {
      currentTime = explicitTime;
    }

    if (repeat >= 0) {
      for (let index = 0; index <= repeat; index += 1) {
        segments.push({
          time: currentTime,
          durationSec: duration / Math.max(timescale, 1),
        });
        currentTime += duration;
      }
    } else {
      const nextTime = si + 1 < sElements.length
        ? numberAttr(sElements[si + 1]!, 't')
        : undefined;
      const boundary = nextTime ?? currentTime + duration;

      while (currentTime < boundary) {
        segments.push({
          time: currentTime,
          durationSec: duration / Math.max(timescale, 1),
        });
        currentTime += duration;
      }
    }
  }

  return segments;
}

function parseSegmentList(
  segmentList: Element,
  baseUrl: string,
): ParsedDashExplicitSegment[] {
  return childrenByTag(segmentList, 'SegmentURL')
    .map<ParsedDashExplicitSegment | undefined>((segment) => {
      const url = resolveUrl(attr(segment, 'media'), baseUrl);

      return url
        ? {
            url,
            ...(parseByteRange(attr(segment, 'mediaRange'))
              ? { byteRange: parseByteRange(attr(segment, 'mediaRange')) }
              : {}),
          }
        : undefined;
    })
    .filter((item): item is ParsedDashExplicitSegment => Boolean(item));
}

export function parseMpd(input: ParseMpdInput): ParsedDashManifest {
  const root = parseMpdRoot(input.content);
  const durationSec = parseDuration(attr(root, 'mediaPresentationDuration'));
  const isLive = attr(root, 'type') === 'dynamic';
  const protection = detectProtection(root);
  const variants: MediaVariant[] = [];
  const audioTracks: AudioTrack[] = [];
  const subtitleTracks: SubtitleTrack[] = [];
  const representations: ParsedDashRepresentation[] = [];

  const mpdBaseUrl = resolveBaseUrl(root, input.manifestUrl);

  for (const period of descendantsByTag(root, 'Period')) {
    const periodBaseUrl = resolveBaseUrl(period, mpdBaseUrl);

    for (const adaptationSet of childrenByTag(period, 'AdaptationSet')) {
    const adaptationBaseUrl = resolveBaseUrl(adaptationSet, periodBaseUrl);
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
        adaptationBaseUrl,
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
          url:
            representationMeta.explicitSegments?.[0]?.url ??
            representationMeta.mediaUrlTemplate,
        });
      }
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
