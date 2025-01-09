import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';

export interface SegmentProgressEvent {
  downloaded: number;
  failed: number;
  total: number;
  segment?: SegmentDescriptor;
}

export type SegmentProgressCallback = (event: SegmentProgressEvent) => void;
