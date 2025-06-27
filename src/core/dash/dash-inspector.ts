export interface DashTimelineEntry {
  time: number;
  durationSec?: number;
}

export interface DashRepresentationInfo {
  id: string;
  bandwidth?: number;
  width?: number;
  height?: number;
  codecs?: string;
  language?: string;
  audioSamplingRate?: number;
  timeline?: DashTimelineEntry[];
}

export interface DashRepresentationInspection {
  isLive: boolean;
  video: DashRepresentationInfo[];
  audio: DashRepresentationInfo[];
}

function childrenByTag(element: Element, tagName: string): Element[] {
  return Array.from(element.children).filter(
    (child) => child.localName === tagName,
  );
}

function firstChildByTag(element: Element, tagName: string): Element | undefined {
  return childrenByTag(element, tagName)[0];
}

function attr(element: Element, name: string): string | undefined {
  return element.getAttribute(name) ?? undefined;
}

function numberAttr(element: Element, name: string): number | undefined {
  const value = attr(element, name);
  const parsed = value ? Number(value) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : undefined;
}

function getTrackType(adaptationSet: Element): 'video' | 'audio' | 'text' {
  const contentType = attr(adaptationSet, 'contentType')?.toLowerCase();
  const mimeType = attr(adaptationSet, 'mimeType')?.toLowerCase();

  if (contentType === 'audio' || mimeType?.startsWith('audio/')) {
    return 'audio';
  }

  if (
    contentType === 'text' ||
    contentType === 'subtitle' ||
    mimeType?.startsWith('text/') ||
    mimeType?.includes('ttml')
  ) {
    return 'text';
  }

  return 'video';
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

function parseSegmentTimeline(
  template: Element | undefined,
): DashTimelineEntry[] | undefined {
  const timeline = template ? firstChildByTag(template, 'SegmentTimeline') : undefined;

  if (!timeline) {
    return undefined;
  }

  const timescale = numberAttr(template, 'timescale') ?? 1;
  const entries: DashTimelineEntry[] = [];
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
        entries.push({
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
        entries.push({
          time: currentTime,
          durationSec: duration / Math.max(timescale, 1),
        });
        currentTime += duration;
      }
    }
  }

  return entries;
}

function inspectRepresentation(
  adaptationSet: Element,
  representation: Element,
): DashRepresentationInfo {
  const id =
    attr(representation, 'id') ??
    `representation-${Array.from(adaptationSet.children).indexOf(representation) + 1}`;
  const template = getSegmentTemplate(adaptationSet, representation);

  return {
    id,
    bandwidth: numberAttr(representation, 'bandwidth'),
    width: numberAttr(representation, 'width') ?? numberAttr(adaptationSet, 'width'),
    height: numberAttr(representation, 'height') ?? numberAttr(adaptationSet, 'height'),
    codecs: attr(representation, 'codecs') ?? attr(adaptationSet, 'codecs'),
    language: attr(representation, 'lang') ?? attr(adaptationSet, 'lang'),
    audioSamplingRate:
      numberAttr(representation, 'audioSamplingRate') ??
      numberAttr(adaptationSet, 'audioSamplingRate'),
    timeline: parseSegmentTimeline(template),
  };
}

export function inspectDashRepresentations(
  content: string,
): DashRepresentationInspection {
  const parser = new DOMParser();
  const document = parser.parseFromString(content, 'application/xml');
  const root = document.documentElement;
  const video: DashRepresentationInfo[] = [];
  const audio: DashRepresentationInfo[] = [];

  for (const adaptationSet of Array.from(root.getElementsByTagNameNS('*', 'AdaptationSet'))) {
    const trackType = getTrackType(adaptationSet);

    if (trackType === 'text') {
      continue;
    }

    for (const representation of childrenByTag(adaptationSet, 'Representation')) {
      const inspected = inspectRepresentation(adaptationSet, representation);

      if (trackType === 'audio') {
        audio.push(inspected);
      } else {
        video.push(inspected);
      }
    }
  }

  return {
    isLive: attr(root, 'type') === 'dynamic',
    video,
    audio,
  };
}
