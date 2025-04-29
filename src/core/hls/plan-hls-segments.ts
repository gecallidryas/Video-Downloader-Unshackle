import type { DownloadSelection, SegmentPlan } from '@/video_downloader_types_skeleton';
import { filterSegmentsByTrim } from '../download/filter-segments-by-trim';
import type { ParsedHlsManifest } from './parse-hls-manifest';
import { selectHlsVariant } from './select-hls-variant';

export interface PlanHlsSegmentsOptions {
  jobId: string;
  selection?: DownloadSelection;
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

  return {
    jobId: options.jobId,
    candidateId: manifest.id,
    protocol: 'hls',
    variantId: variant.id,
    selectedAudioTrackIds: options.selection?.audioTrackIds ?? [],
    selectedSubtitleTrackIds: options.selection?.subtitleTrackIds ?? [],
    segments: filterSegmentsByTrim(
      [...initSegment, ...manifest.segments],
      options.selection?.trim,
    ),
  };
}
