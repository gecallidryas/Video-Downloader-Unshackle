import type {
  DownloadJob,
  JobOutput,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
import { createMuxPlan, type MuxPlan } from '@/src/core/mux/mux-plan';

export type ChromeDownload = (
  options: chrome.downloads.DownloadOptions,
) => Promise<number>;

export interface DirectDownloadExportInput {
  url: string;
  filename: string;
  mimeType: string;
  saveAs?: boolean;
  download?: ChromeDownload;
}

export interface SegmentedExportPlanInput {
  job: DownloadJob;
  plan: SegmentPlan;
  outputName: string;
  estimatedBytes?: number;
  durationSec?: number;
  memoryCeilingBytes?: number;
  opfsAvailable: boolean;
}

export async function exportDirectDownload(
  input: DirectDownloadExportInput,
): Promise<JobOutput> {
  const download = input.download ?? chrome.downloads.download;
  const downloadId = await download({
    url: input.url,
    filename: input.filename,
    saveAs: Boolean(input.saveAs),
  });

  return {
    fileName: input.filename,
    mimeType: input.mimeType,
    outputUrl: input.url,
    downloadId,
  };
}

export function createSegmentedExportPlan(
  input: SegmentedExportPlanInput,
): MuxPlan {
  return createMuxPlan({
    job: input.job,
    segmentPlan: input.plan,
    outputName: input.outputName,
    estimatedBytes: input.estimatedBytes ?? input.job.bytesTotal,
    durationSec: input.durationSec,
    memoryCeilingBytes: input.memoryCeilingBytes,
    opfsAvailable: input.opfsAvailable,
  });
}
