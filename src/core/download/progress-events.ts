import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';
import type { LiveHlsTelemetrySnapshot } from '@/src/core/hls/live-hls-telemetry';

export interface SegmentProgressEvent {
  downloaded: number;
  failed: number;
  total: number;
  segment?: SegmentDescriptor;
  liveHlsTelemetry?: LiveHlsTelemetrySnapshot;
}

export type SegmentProgressCallback = (event: SegmentProgressEvent) => void;
