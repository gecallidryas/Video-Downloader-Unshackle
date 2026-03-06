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
import type { SegmentProgressCallback } from '@/src/core/download/progress-events';
import type { DefaultQualityPolicy } from '@/src/background/settings/settings-store';
import { createLiveHlsTelemetry } from './live-hls-telemetry';
import { planHlsSegments } from './plan-hls-segments';
import type { ParsedHlsManifest } from './parse-hls-manifest';

export type FetchHlsSegment = (
  segment: SegmentDescriptor,
  plan: SegmentPlan,
  request: Parameters<FetchScheduledSegment>[1],
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
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  segmentTimeoutMs?: number;
  qualityPolicy?: DefaultQualityPolicy;
  onPlan?: (plan: SegmentPlan) => void;
  onProgress?: SegmentProgressCallback;
}

function filterSegmentsForSelection(plan: SegmentPlan, job: DownloadJob): SegmentPlan {
  const range = job.selection.segmentRange;

  if (!range) {
    return plan;
  }

  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  const selected = plan.segments.filter(
    (segment) =>
      (segment.index >= start && segment.index <= end) ||
      (segment.initSegment && segment.index < start),
  );

  return {
    ...plan,
    segments: selected,
  };
}

export async function runHlsJob(input: RunHlsJobInput): Promise<JobOutput> {
  if (
    !input.allowProtected &&
    input.manifest.protection.kind !== 'none' &&
    input.manifest.protection.kind !== 'aes-128'
  ) {
    throw new Error('Protected HLS manifests are blocked from the generic HLS runner.');
  }

  const fullPlan = planHlsSegments(input.manifest, {
    jobId: input.job.id,
    selection: input.job.selection,
    qualityPolicy: input.qualityPolicy,
  });
  const plan = filterSegmentsForSelection(fullPlan, input.job);
  const liveTelemetry = input.manifest.isLive ? createLiveHlsTelemetry() : undefined;
  input.onPlan?.(plan);

  if (liveTelemetry) {
    const lastSequence = Math.max(
      0,
      ...input.manifest.segments.map((segment) => segment.mediaSequence ?? segment.index),
    );
    liveTelemetry.recordRefresh({
      newSegments: input.manifest.segments.length,
      lastSequence,
    });
  }

  const parts = await scheduleSegments({
    jobId: input.job.id,
    segments: plan.segments,
    concurrency: input.concurrency ?? 1,
    maxConcurrentPerHost: input.maxConcurrentPerHost,
    segmentTimeoutMs: input.segmentTimeoutMs,
    signal: input.signal,
    fetchKey: input.fetchKey,
    onProgress: input.onProgress
      ? (event) =>
          input.onProgress?.({
            ...event,
            ...(liveTelemetry ? { liveHlsTelemetry: liveTelemetry.snapshot() } : {}),
          })
      : undefined,
    fetchSegment: (segment, request) => input.fetchSegment(segment, plan, request),
  });

  return input.writeOutput(plan, parts);
}
