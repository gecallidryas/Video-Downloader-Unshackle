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
import { planDashSegments } from './plan-dash-segments';
import type { ParsedDashManifest } from './parse-mpd';

export type FetchDashSegment = (
  segment: SegmentDescriptor,
  plan: SegmentPlan,
  request: Parameters<FetchScheduledSegment>[1],
) => Promise<Uint8Array>;

export type WriteDashOutput = (
  plan: SegmentPlan,
  parts: Uint8Array[],
) => Promise<JobOutput>;

export interface RunDashJobInput {
  job: DownloadJob;
  manifest: ParsedDashManifest;
  fetchSegment: FetchDashSegment;
  writeOutput: WriteDashOutput;
  signal?: AbortSignal;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  segmentTimeoutMs?: number;
}

export async function runDashJob(input: RunDashJobInput): Promise<JobOutput> {
  if (!input.allowProtected && input.manifest.protection.kind !== 'none') {
    throw new Error('Protected DASH manifests are blocked from the generic DASH runner.');
  }

  const plan = planDashSegments(input.manifest, {
    jobId: input.job.id,
    selection: input.job.selection,
  });
  const parts = await scheduleSegments({
    jobId: input.job.id,
    segments: plan.segments,
    concurrency: input.concurrency ?? 1,
    maxConcurrentPerHost: input.maxConcurrentPerHost,
    segmentTimeoutMs: input.segmentTimeoutMs,
    signal: input.signal,
    fetchSegment: (segment, request) => input.fetchSegment(segment, plan, request),
  });

  return input.writeOutput(plan, parts);
}
