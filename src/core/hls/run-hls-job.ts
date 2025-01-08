import type {
  DownloadJob,
  JobOutput,
  SegmentDescriptor,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
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
  writeOutput: WriteHlsOutput;
}

export async function runHlsJob(input: RunHlsJobInput): Promise<JobOutput> {
  if (input.manifest.protection.kind !== 'none') {
    throw new Error('Protected HLS manifests are blocked from the generic HLS runner.');
  }

  const plan = planHlsSegments(input.manifest, {
    jobId: input.job.id,
    selection: input.job.selection,
  });
  const parts: Uint8Array[] = [];

  for (const segment of plan.segments) {
    parts.push(await input.fetchSegment(segment, plan));
  }

  return input.writeOutput(plan, parts);
}
