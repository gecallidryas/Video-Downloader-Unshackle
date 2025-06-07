import type {
  AudioTrack,
  ClosedCaptionTrack,
  HlsManifest,
  MediaVariant,
  ProtectionInfo,
  SegmentDescriptor,
  SubtitleTrack,
} from '@/video_downloader_types_skeleton';
import { classifyHlsProtection } from './classify-hls-protection';

export interface ParseHlsManifestInput {
  manifestUrl: string;
  content: string;
}

export interface ParsedHlsManifest extends HlsManifest {
  playlistKind: 'master' | 'media';
  segments: ParsedHlsSegment[];
  initSegmentUrl?: string;
  initSegmentByteRange?: { start: number; end: number };
}

export interface ParsedHlsSegment extends SegmentDescriptor {
  discontinuity?: boolean;
}

type HlsAttributeMap = Record<string, string>;

function hashId(input: string): string {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return `hls-${hash.toString(36)}`;
}

function normalizeLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.toUpperCase() === 'YES';
}

function parseCsv(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items && items.length > 0 ? items : undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseResolution(value: string | undefined): {
  width?: number;
  height?: number;
} {
  if (!value) {
    return {};
  }

  const [width, height] = value.split('x').map((part) => Number(part));

  return {
    width: Number.isFinite(width) ? width : undefined,
    height: Number.isFinite(height) ? height : undefined,
  };
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'track';
}

function parseMediaTag(
  attributes: HlsAttributeMap,
  manifestUrl: string,
): AudioTrack | SubtitleTrack | ClosedCaptionTrack | undefined {
  const type = attributes.TYPE?.toUpperCase();
  const groupId = attributes['GROUP-ID'];
  const name = attributes.NAME ?? 'Track';
  const base = {
    language: attributes.LANGUAGE,
    label: name,
    default: parseBoolean(attributes.DEFAULT),
    autoselect: parseBoolean(attributes.AUTOSELECT),
    characteristics: parseCsv(attributes.CHARACTERISTICS),
    groupId,
  };

  if (type === 'AUDIO') {
    return {
      ...base,
      id: `audio-${slug(groupId ?? 'audio')}-${slug(name)}`,
      kind: 'audio',
      channels: attributes.CHANNELS,
      url: resolveUrl(attributes.URI, manifestUrl),
    };
  }

  if (type === 'SUBTITLES') {
    const resolvedUrl = resolveUrl(attributes.URI, manifestUrl);
    const extension = resolvedUrl?.split(/[?#]/, 1)[0]?.split('.').pop()?.toLowerCase();

    return {
      ...base,
      id: `subtitle-${slug(groupId ?? 'subtitle')}-${slug(name)}`,
      kind: 'subtitle',
      url: resolvedUrl,
      format: extension === 'vtt' ? 'vtt' : 'unknown',
    };
  }

  if (type === 'CLOSED-CAPTIONS') {
    return {
      ...base,
      id: `cc-${slug(groupId ?? 'cc')}-${slug(name)}`,
      kind: 'closed-caption',
      instreamId: attributes['INSTREAM-ID'],
    };
  }

  return undefined;
}

function protectionFromKeyTag(attributes: HlsAttributeMap): ProtectionInfo {
  return classifyHlsProtection([
    `#EXT-X-KEY:${Object.entries(attributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(',')}`,
  ]);
}

function parseByteRange(
  value: string | undefined,
  previousEnd?: number,
): { start: number; end: number } | undefined {
  if (!value) {
    return undefined;
  }

  const [lengthRaw, offsetRaw] = value.split('@');
  const length = Number(lengthRaw);

  if (!Number.isFinite(length) || length <= 0) {
    return undefined;
  }

  const start =
    offsetRaw !== undefined && offsetRaw !== ''
      ? Number(offsetRaw)
      : (previousEnd ?? -1) + 1;

  if (!Number.isFinite(start) || start < 0) {
    return undefined;
  }

  return { start, end: start + length - 1 };
}

function parseMasterPlaylist(
  lines: string[],
  manifestUrl: string,
): Pick<
  ParsedHlsManifest,
  'variants' | 'audioTracks' | 'subtitleTracks' | 'closedCaptions' | 'protection'
> {
  const variants: MediaVariant[] = [];
  const audioTracks: AudioTrack[] = [];
  const subtitleTracks: SubtitleTrack[] = [];
  const closedCaptions: ClosedCaptionTrack[] = [];
  let pendingVariantAttributes: HlsAttributeMap | undefined;
  let protection: ProtectionInfo = { kind: 'none' };

  for (const line of lines) {
    if (line.startsWith('#EXT-X-MEDIA:')) {
      const track = parseMediaTag(
        parseAttributes(line.slice('#EXT-X-MEDIA:'.length)),
        manifestUrl,
      );

      if (track?.kind === 'audio') {
        audioTracks.push(track);
      } else if (track?.kind === 'subtitle') {
        subtitleTracks.push(track);
      } else if (track?.kind === 'closed-caption') {
        closedCaptions.push(track);
      }
    } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
      pendingVariantAttributes = parseAttributes(
        line.slice('#EXT-X-STREAM-INF:'.length),
      );
    } else if (line.startsWith('#EXT-X-KEY:')) {
      protection = protectionFromKeyTag(
        parseAttributes(line.slice('#EXT-X-KEY:'.length)),
      );
    } else if (!line.startsWith('#') && pendingVariantAttributes) {
      const { width, height } = parseResolution(pendingVariantAttributes.RESOLUTION);
      const index = variants.length + 1;

      variants.push({
        id: `variant-${index}`,
        url: resolveUrl(line, manifestUrl),
        width,
        height,
        bitrate: parseNumber(pendingVariantAttributes.BANDWIDTH),
        averageBitrate: parseNumber(pendingVariantAttributes['AVERAGE-BANDWIDTH']),
        frameRate: parseNumber(pendingVariantAttributes['FRAME-RATE']),
        codecs: pendingVariantAttributes.CODECS?.split(',').map((codec) => codec.trim()),
        audioGroupId: pendingVariantAttributes.AUDIO,
        subtitleGroupId: pendingVariantAttributes.SUBTITLES,
        closedCaptionGroupId: pendingVariantAttributes['CLOSED-CAPTIONS'],
        isDefault: index === 1,
      });
      pendingVariantAttributes = undefined;
    }
  }

  return { variants, audioTracks, subtitleTracks, closedCaptions, protection };
}

function parseMediaPlaylist(
  lines: string[],
  manifestUrl: string,
): Pick<
  ParsedHlsManifest,
  | 'segments'
  | 'initSegmentUrl'
  | 'initSegmentByteRange'
  | 'protection'
  | 'targetDurationSec'
  | 'durationSec'
> {
  const segments: ParsedHlsSegment[] = [];
  let initSegmentUrl: string | undefined;
  let initSegmentByteRange: { start: number; end: number } | undefined;
  let pendingDuration: number | undefined;
  let pendingByteRange: { start: number; end: number } | undefined;
  let previousByteRangeEnd: number | undefined;
  let pendingDiscontinuity = false;
  let protection: ProtectionInfo = { kind: 'none' };
  let currentEncryption: ParsedHlsSegment['encryption'];
  let targetDurationSec: number | undefined;
  let durationSec = 0;
  let mediaSequenceBase = 0;

  for (const line of lines) {
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDurationSec = parseNumber(line.slice('#EXT-X-TARGETDURATION:'.length));
    } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequenceBase =
        parseNumber(line.slice('#EXT-X-MEDIA-SEQUENCE:'.length)) ?? mediaSequenceBase;
    } else if (line.startsWith('#EXT-X-MAP:')) {
      const attributes = parseAttributes(line.slice('#EXT-X-MAP:'.length));
      initSegmentUrl = resolveUrl(attributes.URI, manifestUrl);
      initSegmentByteRange = parseByteRange(attributes.BYTERANGE);
    } else if (line.startsWith('#EXT-X-KEY:')) {
      const attributes = parseAttributes(line.slice('#EXT-X-KEY:'.length));
      protection = protectionFromKeyTag(attributes);
      if (protection.kind === 'aes-128') {
        currentEncryption = {
          method: 'AES-128',
          keyUri: resolveUrl(attributes.URI, manifestUrl),
          iv: attributes.IV,
        };
      } else if (protection.kind === 'none') {
        currentEncryption = undefined;
      }
    } else if (line.startsWith('#EXTINF:')) {
      pendingDuration = parseNumber(
        line.slice('#EXTINF:'.length).split(',', 1)[0],
      );
    } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
      pendingByteRange = parseByteRange(
        line.slice('#EXT-X-BYTERANGE:'.length),
        previousByteRangeEnd,
      );
    } else if (line.startsWith('#EXT-X-DISCONTINUITY')) {
      pendingDiscontinuity = true;
    } else if (!line.startsWith('#')) {
      const index = segments.length + 1;
      const segment: ParsedHlsSegment = {
        id: `hls-segment-${index}`,
        index,
        mediaSequence: mediaSequenceBase + index - 1,
        url: resolveUrl(line, manifestUrl) ?? line,
        durationSec: pendingDuration,
        byteRange: pendingByteRange,
        discontinuity: pendingDiscontinuity || undefined,
        encryption: currentEncryption,
      };

      segments.push(segment);
      previousByteRangeEnd = pendingByteRange?.end ?? previousByteRangeEnd;
      durationSec += pendingDuration ?? 0;
      pendingDuration = undefined;
      pendingByteRange = undefined;
      pendingDiscontinuity = false;
    }
  }

  return {
    segments,
    initSegmentUrl,
    initSegmentByteRange,
    protection,
    targetDurationSec,
    durationSec: durationSec || undefined,
  };
}

export function parseHlsManifest(input: ParseHlsManifestInput): ParsedHlsManifest {
  const lines = normalizeLines(input.content);
  const isMaster = lines.some((line) => line.startsWith('#EXT-X-STREAM-INF:'));
  const isLive = !isMaster && !lines.includes('#EXT-X-ENDLIST');
  const playlistType = lines
    .find((line) => line.startsWith('#EXT-X-PLAYLIST-TYPE:'))
    ?.slice('#EXT-X-PLAYLIST-TYPE:'.length)
    .trim()
    .toUpperCase();
  const master = isMaster
    ? parseMasterPlaylist(lines, input.manifestUrl)
    : {
        variants: [],
        audioTracks: [],
        subtitleTracks: [],
        closedCaptions: [],
        protection: { kind: 'none' } as ProtectionInfo,
      };
  const media = !isMaster
    ? parseMediaPlaylist(lines, input.manifestUrl)
    : {
        segments: [],
        initSegmentUrl: undefined,
        protection: { kind: 'none' } as ProtectionInfo,
        targetDurationSec: undefined,
        durationSec: undefined,
        initSegmentByteRange: undefined,
      };

  return {
    id: hashId(input.manifestUrl),
    protocol: 'hls',
    sourceUrl: input.manifestUrl,
    playlistKind: isMaster ? 'master' : 'media',
    isLive,
    isEvent: playlistType === 'EVENT',
    durationSec: media.durationSec,
    targetDurationSec: media.targetDurationSec,
    protection: isMaster ? master.protection : media.protection,
    variants: isMaster
      ? master.variants
      : [
          {
            id: 'media-playlist',
            url: input.manifestUrl,
            isDefault: true,
          },
        ],
    audioTracks: master.audioTracks,
    subtitleTracks: master.subtitleTracks,
    closedCaptions: master.closedCaptions,
    segments: media.segments,
    initSegmentUrl: media.initSegmentUrl,
    initSegmentByteRange: media.initSegmentByteRange,
  };
}
