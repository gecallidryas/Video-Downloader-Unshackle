import type {
  DownloadJob,
  JobOutput,
  SegmentDescriptor,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
import {
  scheduleSegments,
  type FetchScheduledSegment,
  type SegmentSchedulerStorage,
} from '@/src/core/download/segment-scheduler';
import type { SegmentProgressCallback } from '@/src/core/download/progress-events';
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

export interface DashSegmentExportEvent {
  segment: SegmentDescriptor;
  bytes: Uint8Array;
  isInitSegment: boolean;
}

export type DashSegmentExportCallback = (
  event: DashSegmentExportEvent,
) => Promise<void>;

export interface RunDashJobInput {
  job: DownloadJob;
  manifest: ParsedDashManifest;
  fetchSegment: FetchDashSegment;
  writeOutput: WriteDashOutput;
  signal?: AbortSignal;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  bandwidthBytesPerSecond?: number;
  segmentTimeoutMs?: number;
  fragmentStore?: SegmentSchedulerStorage;
  onProgress?: SegmentProgressCallback;
  onSegmentExport?: DashSegmentExportCallback;
}

export async function runDashJob(input: RunDashJobInput): Promise<JobOutput> {
  if (!input.allowProtected && input.manifest.protection.kind !== 'none') {
    throw new Error('Protected DASH manifests are blocked from the generic DASH runner.');
  }

  const plan = planDashSegments(input.manifest, {
    jobId: input.job.id,
    selection: input.job.selection,
  });
  const segmentOrder = new Map(
    plan.segments.map((segment, index) => [segment.id, index]),
  );
  const orderedExportBuffer = new Map<number, DashSegmentExportEvent>();
  let nextExportIndex = 0;
  let exportFlushChain = Promise.resolve();

  async function flushOrderedExport(): Promise<void> {
    if (!input.onSegmentExport) {
      return;
    }

    while (orderedExportBuffer.has(nextExportIndex)) {
      const event = orderedExportBuffer.get(nextExportIndex);

      if (!event) {
        return;
      }

      orderedExportBuffer.delete(nextExportIndex);
      nextExportIndex += 1;
      await input.onSegmentExport(event);
    }
  }

  const parts = await scheduleSegments({
    jobId: input.job.id,
    segments: plan.segments,
    storage: input.fragmentStore,
    concurrency: input.concurrency ?? 1,
    maxConcurrentPerHost: input.maxConcurrentPerHost,
    bandwidthBytesPerSecond: input.bandwidthBytesPerSecond,
    segmentTimeoutMs: input.segmentTimeoutMs,
    signal: input.signal,
    onProgress: input.onProgress,
    onSegmentComplete: input.onSegmentExport
      ? async (event) => {
          const order = segmentOrder.get(event.segment.id);

          if (order === undefined) {
            throw new Error(`Completed segment is not in the selected DASH plan: ${event.segment.id}`);
          }

          orderedExportBuffer.set(order, event);
          const flush = exportFlushChain.then(() => flushOrderedExport());
          exportFlushChain = flush.catch(() => undefined);
          await flush;
        }
      : undefined,
    fetchSegment: (segment, request) => input.fetchSegment(segment, plan, request),
  });

  return input.writeOutput(plan, parts);
}
