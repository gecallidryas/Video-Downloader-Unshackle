import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';

export interface HlsSegmentWorkerRequest {
  segment: SegmentDescriptor;
}

export interface HlsSegmentWorkerResponse {
  segmentId: string;
  ok: boolean;
}

export function createHlsSegmentWorkerResponse(
  request: HlsSegmentWorkerRequest,
): HlsSegmentWorkerResponse {
  return {
    segmentId: request.segment.id,
    ok: true,
  };
}
