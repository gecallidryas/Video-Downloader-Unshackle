import type { DownloadSelection, SegmentDescriptor, SegmentPlan } from '@/video_downloader_types_skeleton';
import { filterSegmentsByTrim } from '../download/filter-segments-by-trim';
import type { ParsedDashManifest } from './parse-mpd';
import { selectDashRepresentation } from './select-representation';

export interface PlanDashSegmentsOptions {
  jobId: string;
  selection?: DownloadSelection;
}

// A DASH presentation that exposes both a video and a separate audio
// AdaptationSet requires muxing two independent sources, which the browser-only
// path cannot do. The single-representation planner would emit video-only,
// producing a silent file, so callers must refuse and defer to native FFmpeg.
export function dashRequiresSeparateAudioVideo(
  manifest: ParsedDashManifest,
): boolean {
  const trackTypes = new Set(
    manifest.representations.map((representation) => representation.trackType),
  );

  return trackTypes.has('video') && trackTypes.has('audio');
}

function replaceNumberToken(template: string, number: number): string {
  return template.replace(/\$Number(?:%0(\d+)d)?\$/g, (_match, width: string) => {
    if (!width) {
      return String(number);
    }

    return String(number).padStart(Number(width), '0');
  });
}

function replaceTimeToken(template: string, time: number): string {
  return template.replace(/\$Time\$/g, String(time));
}

export function planDashSegments(
  manifest: ParsedDashManifest,
  options: PlanDashSegmentsOptions,
): SegmentPlan {
  if (manifest.protection.kind !== 'none') {
    throw new Error('Protected DASH manifests cannot be planned by the generic DASH planner.');
  }

  const representation = selectDashRepresentation(manifest, options.selection);
  const segments: SegmentDescriptor[] = [];

  if (representation.initializationUrl) {
    segments.push({
      id: `dash-init-${representation.id}`,
      index: 0,
      url: representation.initializationUrl,
      initSegment: true,
      trackType: 'video',
    });
  }

  if (!representation.mediaUrlTemplate && !representation.explicitSegments) {
    throw new Error(`DASH representation has no media URL template: ${representation.id}`);
  }

  const mediaUrlTemplate = representation.mediaUrlTemplate;

  if (representation.explicitSegments) {
    for (const explicitSegment of representation.explicitSegments) {
      const index = segments.length;

      segments.push({
        id: `dash-segment-${representation.id}-${index}`,
        index,
        url: explicitSegment.url,
        trackType: 'video',
        byteRange: explicitSegment.byteRange,
        durationSec: explicitSegment.durationSec,
      });
    }
  } else if (representation.timeline && mediaUrlTemplate) {
    for (const timelineSegment of representation.timeline) {
      const index = segments.length;

      segments.push({
        id: `dash-segment-${representation.id}-${timelineSegment.time}`,
        index,
        url: replaceTimeToken(mediaUrlTemplate, timelineSegment.time),
        trackType: 'video',
        durationSec: timelineSegment.durationSec,
      });
    }
  } else {
  if (!mediaUrlTemplate) {
    throw new Error(`DASH representation has no media URL template: ${representation.id}`);
  }

  for (let offset = 0; offset < representation.segmentCount; offset += 1) {
    const number = representation.startNumber + offset;
    const index = segments.length;

    segments.push({
      id: `dash-segment-${representation.id}-${number}`,
      index,
      url: replaceNumberToken(mediaUrlTemplate, number),
      trackType: 'video',
      durationSec: representation.segmentDurationSec,
    });
  }
  }

  return {
    jobId: options.jobId,
    candidateId: manifest.id,
    protocol: 'dash',
    variantId: representation.id,
    selectedAudioTrackIds: options.selection?.audioTrackIds ?? [],
    selectedSubtitleTrackIds: options.selection?.subtitleTrackIds ?? [],
    segments: filterSegmentsByTrim(segments, options.selection?.trim),
  };
}
