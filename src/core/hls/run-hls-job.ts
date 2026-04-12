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
import { createIndexedDbFragmentStore } from '@/src/core/storage/indexeddb-fragment-store';
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

export interface HlsSegmentExportEvent {
  segment: SegmentDescriptor;
  bytes: Uint8Array;
  isInitSegment: boolean;
}

export type HlsSegmentExportCallback = (
  event: HlsSegmentExportEvent,
) => Promise<void>;

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
  bandwidthBytesPerSecond?: number;
  segmentTimeoutMs?: number;
  qualityPolicy?: DefaultQualityPolicy;
  fragmentStore?: SegmentSchedulerStorage;
  onPlan?: (plan: SegmentPlan) => void | Promise<void>;
  onProgress?: SegmentProgressCallback;
  onSegmentExport?: HlsSegmentExportCallback;
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
  await input.onPlan?.(plan);
  const segmentOrder = new Map(
    plan.segments.map((segment, index) => [segment.id, index]),
  );
  const orderedExportBuffer = new Map<number, HlsSegmentExportEvent>();
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

  const fragmentStore = input.fragmentStore ?? createIndexedDbFragmentStore();
  const parts = await scheduleSegments({
    jobId: input.job.id,
    segments: plan.segments,
    storage: fragmentStore,
    concurrency: input.concurrency ?? 1,
    maxConcurrentPerHost: input.maxConcurrentPerHost,
    bandwidthBytesPerSecond: input.bandwidthBytesPerSecond,
    segmentTimeoutMs: input.segmentTimeoutMs,
    signal: input.signal,
    fetchKey: input.fetchKey,
    onSegmentComplete: input.onSegmentExport
      ? async (event) => {
          const order = segmentOrder.get(event.segment.id);

          if (order === undefined) {
            throw new Error(`Completed segment is not in the selected HLS plan: ${event.segment.id}`);
          }

          orderedExportBuffer.set(order, event);
          const flush = exportFlushChain.then(() => flushOrderedExport());
          exportFlushChain = flush.catch(() => undefined);
          await flush;
        }
      : undefined,
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
