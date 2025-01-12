import type {
  DownloadJob,
  JobOutput,
  SegmentDescriptor,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
import {
  scheduleSegments,
  type FetchScheduledSegment,
} from '@/src/core/download/segment-scheduler';
import { planHlsSegments } from './plan-hls-segments';
import type { ParsedHlsManifest } from './parse-hls-manifest';

export type FetchHlsSegment = (
  segment: SegmentDescriptor,
  plan: SegmentPlan,
) => Promise<Uint8Array>;

export type WriteHlsOutput = (
  plan: SegmentPlan,
  parts: Uint8Array[],
) => Promise<JobOutput>;

export interface RunHlsJobInput {
  job: DownloadJob;
  manifest: ParsedHlsManifest;
  fetchSegment: FetchHlsSegment;
  fetchKey?: (
    keyUri: string,
    request: Parameters<FetchScheduledSegment>[1],
  ) => Promise<Uint8Array>;
  writeOutput: WriteHlsOutput;
  signal?: AbortSignal;
}

export async function runHlsJob(input: RunHlsJobInput): Promise<JobOutput> {
  if (
    input.manifest.protection.kind !== 'none' &&
    input.manifest.protection.kind !== 'aes-128'
  ) {
    throw new Error('Protected HLS manifests are blocked from the generic HLS runner.');
  }

  const plan = planHlsSegments(input.manifest, {
    jobId: input.job.id,
    selection: input.job.selection,
  });
  const parts = await scheduleSegments({
    jobId: input.job.id,
    segments: plan.segments,
    concurrency: 1,
    signal: input.signal,
    fetchKey: input.fetchKey,
    fetchSegment: (segment) => input.fetchSegment(segment, plan),
  });

  return input.writeOutput(plan, parts);
}
