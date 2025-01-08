import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';

export interface DashSegmentWorkerRequest {
  segment: SegmentDescriptor;
}

export interface DashSegmentWorkerResponse {
  segmentId: string;
  ok: boolean;
}

export function createDashSegmentWorkerResponse(
  request: DashSegmentWorkerRequest,
): DashSegmentWorkerResponse {
  return {
    segmentId: request.segment.id,
    ok: true,
  };
}
