import type {
  DownloadJob,
  JobOutput,
  SegmentDescriptor,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
import { planDashSegments } from './plan-dash-segments';
import type { ParsedDashManifest } from './parse-mpd';

export type FetchDashSegment = (
  segment: SegmentDescriptor,
  plan: SegmentPlan,
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
}

export async function runDashJob(input: RunDashJobInput): Promise<JobOutput> {
  if (input.manifest.protection.kind !== 'none') {
    throw new Error('Protected DASH manifests are blocked from the generic DASH runner.');
  }

  const plan = planDashSegments(input.manifest, {
    jobId: input.job.id,
    selection: input.job.selection,
  });
  const parts: Uint8Array[] = [];

  for (const segment of plan.segments) {
    parts.push(await input.fetchSegment(segment, plan));
  }

  return input.writeOutput(plan, parts);
}
