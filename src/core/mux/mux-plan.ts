import type { DownloadJob, SegmentPlan } from '@/video_downloader_types_skeleton';
import {
  chooseMuxStoragePolicy,
  type MuxStoragePolicy,
} from './memory-policy';

export interface MuxPlanInput {
  job: DownloadJob;
  segmentPlan: SegmentPlan;
  outputName: string;
  estimatedBytes?: number;
  durationSec?: number;
  memoryCeilingBytes?: number;
  opfsAvailable: boolean;
}

export interface MuxPlan extends MuxStoragePolicy {
  jobId: string;
  outputName: string;
  segmentPlan: SegmentPlan;
}

export function createMuxPlan(input: MuxPlanInput): MuxPlan {
  return {
    ...chooseMuxStoragePolicy(input),
    jobId: input.job.id,
    outputName: input.outputName,
    segmentPlan: input.segmentPlan,
  };
}
