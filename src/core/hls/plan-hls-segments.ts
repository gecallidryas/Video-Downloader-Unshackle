import type { DownloadSelection, SegmentPlan } from '@/video_downloader_types_skeleton';
import { filterSegmentsByTrim } from '../download/filter-segments-by-trim';
import type { ParsedHlsManifest } from './parse-hls-manifest';
import { selectHlsVariant } from './select-hls-variant';

export type DiscontinuityPolicy = 'include-all' | 'skip-ads' | 'ask-user';

export interface PlanHlsSegmentsOptions {
  jobId: string;
  selection?: DownloadSelection;
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

  const variant = selectHlsVariant(manifest, options.selection);

  if (manifest.playlistKind !== 'media') {
    throw new Error('HLS segment planning requires a media playlist.');
  }

  const initSegment = manifest.initSegmentUrl
    ? [
        {
          id: 'hls-init-0',
          index: 0,
          url: manifest.initSegmentUrl,
          initSegment: true,
          byteRange: manifest.initSegmentByteRange,
          trackType: 'video' as const,
        },
      ]
    : [];

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
      [...initSegment, ...mediaSegments],
      options.selection?.trim,
    ),
  };
}
