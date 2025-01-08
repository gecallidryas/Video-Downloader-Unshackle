import type {
  AudioTrack,
  HlsManifest,
  MediaVariant,
  ProtectionInfo,
  SegmentDescriptor,
  SubtitleTrack,
} from '@/video_downloader_types_skeleton';

export interface ParseHlsManifestInput {
  manifestUrl: string;
  content: string;
}

export interface ParsedHlsManifest extends HlsManifest {
  playlistKind: 'master' | 'media';
  segments: SegmentDescriptor[];
  initSegmentUrl?: string;
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
): AudioTrack | SubtitleTrack | undefined {
  const type = attributes.TYPE?.toUpperCase();
  const groupId = attributes['GROUP-ID'];
  const name = attributes.NAME ?? 'Track';
  const base = {
    language: attributes.LANGUAGE,
    label: name,
    default: parseBoolean(attributes.DEFAULT),
    autoselect: parseBoolean(attributes.AUTOSELECT),
    groupId,
  };

  if (type === 'AUDIO') {
    return {
      ...base,
      id: `audio-${slug(groupId ?? 'audio')}-${slug(name)}`,
      kind: 'audio',
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

  return undefined;
}

function protectionFromKeyTag(attributes: HlsAttributeMap): ProtectionInfo {
  const method = attributes.METHOD;

  if (!method || method.toUpperCase() === 'NONE') {
    return { kind: 'none' };
  }

  if (method.toUpperCase() === 'AES-128') {
    return {
      kind: 'aes-128',
      method,
      keyUri: attributes.URI,
      iv: attributes.IV,
      reason: 'HLS manifest declares encrypted media segments.',
    };
  }

  if (method.toUpperCase() === 'SAMPLE-AES') {
    return {
      kind: 'sample-aes',
      method,
      keyFormat: attributes.KEYFORMAT,
      keyUri: attributes.URI,
      iv: attributes.IV,
      reason: 'HLS manifest declares encrypted media segments.',
    };
  }

  return {
    kind: 'unknown',
    method,
    keyFormat: attributes.KEYFORMAT,
    keyUri: attributes.URI,
    iv: attributes.IV,
    reason: 'HLS manifest declares an unknown encryption method.',
  };
}

function parseMasterPlaylist(
  lines: string[],
  manifestUrl: string,
): Pick<ParsedHlsManifest, 'variants' | 'audioTracks' | 'subtitleTracks' | 'protection'> {
  const variants: MediaVariant[] = [];
  const audioTracks: AudioTrack[] = [];
  const subtitleTracks: SubtitleTrack[] = [];
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
        isDefault: index === 1,
      });
      pendingVariantAttributes = undefined;
    }
  }

  return { variants, audioTracks, subtitleTracks, protection };
}

function parseMediaPlaylist(
  lines: string[],
  manifestUrl: string,
): Pick<ParsedHlsManifest, 'segments' | 'initSegmentUrl' | 'protection' | 'targetDurationSec'> {
  const segments: SegmentDescriptor[] = [];
  let initSegmentUrl: string | undefined;
  let pendingDuration: number | undefined;
  let protection: ProtectionInfo = { kind: 'none' };
  let targetDurationSec: number | undefined;

  for (const line of lines) {
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDurationSec = parseNumber(line.slice('#EXT-X-TARGETDURATION:'.length));
    } else if (line.startsWith('#EXT-X-MAP:')) {
      const attributes = parseAttributes(line.slice('#EXT-X-MAP:'.length));
      initSegmentUrl = resolveUrl(attributes.URI, manifestUrl);
    } else if (line.startsWith('#EXT-X-KEY:')) {
      protection = protectionFromKeyTag(
        parseAttributes(line.slice('#EXT-X-KEY:'.length)),
      );
    } else if (line.startsWith('#EXTINF:')) {
      pendingDuration = parseNumber(
        line.slice('#EXTINF:'.length).split(',', 1)[0],
      );
    } else if (!line.startsWith('#')) {
      const index = segments.length + 1;

      segments.push({
        id: `hls-segment-${index}`,
        index,
        url: resolveUrl(line, manifestUrl) ?? line,
        durationSec: pendingDuration,
      });
      pendingDuration = undefined;
    }
  }

  return { segments, initSegmentUrl, protection, targetDurationSec };
}

export function parseHlsManifest(input: ParseHlsManifestInput): ParsedHlsManifest {
  const lines = normalizeLines(input.content);
  const isMaster = lines.some((line) => line.startsWith('#EXT-X-STREAM-INF:'));
  const isLive = !isMaster && !lines.includes('#EXT-X-ENDLIST');
  const master = isMaster
    ? parseMasterPlaylist(lines, input.manifestUrl)
    : {
        variants: [],
        audioTracks: [],
        subtitleTracks: [],
        protection: { kind: 'none' } as ProtectionInfo,
      };
  const media = !isMaster
    ? parseMediaPlaylist(lines, input.manifestUrl)
    : {
        segments: [],
        initSegmentUrl: undefined,
        protection: { kind: 'none' } as ProtectionInfo,
        targetDurationSec: undefined,
      };

  return {
    id: hashId(input.manifestUrl),
    protocol: 'hls',
    sourceUrl: input.manifestUrl,
    playlistKind: isMaster ? 'master' : 'media',
    isLive,
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
    segments: media.segments,
    initSegmentUrl: media.initSegmentUrl,
  };
}
