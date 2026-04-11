import type { DownloadSelection, SegmentPlan } from '@/video_downloader_types_skeleton';
import type { DefaultQualityPolicy } from '@/src/background/settings/settings-store';
import { filterSegmentsByTrim } from '../download/filter-segments-by-trim';
import type { ParsedHlsManifest } from './parse-hls-manifest';
import { selectHlsVariant } from './select-hls-variant';
import { propagateQueryParams } from './signed-query';

export type DiscontinuityPolicy = 'include-all' | 'skip-ads' | 'ask-user';

export interface PlanHlsSegmentsOptions {
  jobId: string;
  selection?: DownloadSelection;
  qualityPolicy?: DefaultQualityPolicy;
  discontinuityPolicy?: DiscontinuityPolicy;
}

export interface DiscontinuityGroup<TSegment> {
  timelineIndex: number;
  segments: TSegment[];
}

export function groupByDiscontinuity<TSegment extends { discontinuity?: boolean }>(
  segments: TSegment[],
): Array<DiscontinuityGroup<TSegment>> {
  const groups: Array<DiscontinuityGroup<TSegment>> = [];

  for (const segment of segments) {
    if (groups.length === 0 || segment.discontinuity) {
      groups.push({ timelineIndex: groups.length, segments: [] });
    }

    groups[groups.length - 1]?.segments.push(segment);
  }

  return groups;
}

function applyDiscontinuityPolicy(
  segments: ParsedHlsManifest['segments'],
  policy: DiscontinuityPolicy,
): ParsedHlsManifest['segments'] {
  if (policy !== 'skip-ads') {
    return segments;
  }

  const groups = groupByDiscontinuity(segments);
  const longest = groups.reduce<DiscontinuityGroup<ParsedHlsManifest['segments'][number]> | undefined>(
    (current, group) =>
      !current || group.segments.length > current.segments.length ? group : current,
    undefined,
  );

  return longest?.segments ?? segments;
}

function initMapKey(
  url: string,
  byteRange: { start: number; end: number } | undefined,
): string {
  return `${url}|${byteRange?.start ?? ''}-${byteRange?.end ?? ''}`;
}

function buildSegmentsWithInitMaps(
  segments: ParsedHlsManifest['segments'],
  manifest: ParsedHlsManifest,
): SegmentPlan['segments'] {
  const planned: SegmentPlan['segments'] = [];
  let lastInitMapKey: string | undefined;
  let initMapCount = 0;

  for (const segment of segments) {
    const initSegmentUrl = segment.initSegmentUrl ?? manifest.initSegmentUrl;
    const initSegmentByteRange =
      segment.initSegmentByteRange ?? manifest.initSegmentByteRange;

    if (initSegmentUrl) {
      const key = initMapKey(initSegmentUrl, initSegmentByteRange);

      if (key !== lastInitMapKey) {
        planned.push({
          id: `hls-init-${initMapCount}`,
          index: 0,
          url: propagateQueryParams(initSegmentUrl, manifest.sourceUrl),
          initSegment: true,
          byteRange: initSegmentByteRange,
          trackType: 'video',
        });
        lastInitMapKey = key;
        initMapCount += 1;
      }
    }

    planned.push({
      ...segment,
      url: propagateQueryParams(segment.url, manifest.sourceUrl),
      encryption:
        segment.encryption?.keyUri
          ? {
              ...segment.encryption,
              keyUri: propagateQueryParams(
                segment.encryption.keyUri,
                manifest.sourceUrl,
              ),
            }
          : segment.encryption,
    });
  }

  return planned;
}

// An HLS master that selects a video variant whose audio is delivered as a
// separate EXT-X-MEDIA rendition (an alternate audio group with its own URI)
// needs two independent sources muxed together. The browser-only path cannot do
// that — the media playlist behind the video variant is video-only — so callers
// must refuse and defer to native FFmpeg instead of emitting a silent file.
export function hlsRequiresSeparateAudio(
  manifest: ParsedHlsManifest,
  selectedVariant?: { audioGroupId?: string },
): boolean {
  const audioRenditions = manifest.audioTracks.filter((track) =>
    Boolean(track.url),
  );

  if (audioRenditions.length === 0) {
    return false;
  }

  const selectedGroupId = selectedVariant?.audioGroupId;

  if (selectedGroupId) {
    return audioRenditions.some((track) => track.groupId === selectedGroupId);
  }

  return manifest.variants.some(
    (variant) =>
      variant.audioGroupId !== undefined &&
      audioRenditions.some((track) => track.groupId === variant.audioGroupId),
  );
}

export function planHlsSegments(
  manifest: ParsedHlsManifest,
  options: PlanHlsSegmentsOptions,
): SegmentPlan {
  if (
    manifest.protection.kind !== 'none' &&
    manifest.protection.kind !== 'aes-128'
  ) {
    throw new Error('Protected HLS manifests cannot be planned by the generic HLS planner.');
  }

  const variant = selectHlsVariant(manifest, options.selection, {
    qualityPolicy: options.qualityPolicy,
  });

  if (manifest.playlistKind !== 'media') {
    throw new Error('HLS segment planning requires a media playlist.');
  }

  const mediaSegments = applyDiscontinuityPolicy(
    manifest.segments,
    options.discontinuityPolicy ?? 'include-all',
  );

  return {
    jobId: options.jobId,
    candidateId: manifest.id,
    protocol: 'hls',
    variantId: variant.id,
    selectedAudioTrackIds: options.selection?.audioTrackIds ?? [],
    selectedSubtitleTrackIds: options.selection?.subtitleTrackIds ?? [],
    segments: filterSegmentsByTrim(
      buildSegmentsWithInitMaps(mediaSegments, manifest),
      options.selection?.trim,
    ),
  };
}
