import type {
  DownloadJob,
  JobOutput,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import type { ChromeDownload } from '@/src/core/export/downloads-export';
import { exportBlobDownload } from '@/src/core/export/downloads-export';

export interface BrowserDirectTrimResponse {
  ok: boolean;
  assetUrl: string;
  mimeType: string;
}

export interface RunBrowserDirectTrimJobInput {
  candidate: MediaCandidate;
  job: DownloadJob;
  offscreenRecord: (message: Record<string, unknown>) => Promise<BrowserDirectTrimResponse>;
  download?: ChromeDownload;
  fetchDataUrl?: (dataUrl: string) => Promise<Blob>;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  maxDurationSec?: number;
}

const DEFAULT_MAX_BROWSER_TRIM_DURATION_SEC = 600;

function isProtected(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'unknown' ||
    candidate.protection.kind === 'sample-aes'
  );
}

function hasTrimBounds(job: DownloadJob): job is DownloadJob & {
  selection: DownloadJob['selection'] & { trim: { startSec: number; endSec: number } };
} {
  const trim = job.selection.trim;

  return (
    trim?.startSec !== undefined &&
    trim.endSec !== undefined &&
    trim.endSec > trim.startSec
  );
}

function trimOutputName(displayName: string): string {
  const baseName = displayName.replace(/\.[^./\\]+$/, '') || 'download';

  return `${baseName}.trim.webm`;
}

async function defaultFetchDataUrl(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);

  if (!response.ok) {
    throw new Error(`Failed to read browser-recorded trim asset: ${response.status}`);
  }

  return response.blob();
}

export async function runBrowserDirectTrimJob(
  input: RunBrowserDirectTrimJobInput,
): Promise<JobOutput> {
  if (isProtected(input.candidate)) {
    throw new Error('Protected media cannot be browser-recorded.');
  }

  const sourceUrl = input.candidate.sourceUrl;

  if (!sourceUrl) {
    throw new Error('Browser direct trim requires a source URL.');
  }

  if (input.job.selection.outputKind !== 'webm') {
    throw new Error('Browser direct trim requires WebM output selection.');
  }

  if (!hasTrimBounds(input.job)) {
    throw new Error('Browser direct trim requires start and end trim times.');
  }

  const durationSec = input.job.selection.trim.endSec - input.job.selection.trim.startSec;
  const maxDurationSec = input.maxDurationSec ?? DEFAULT_MAX_BROWSER_TRIM_DURATION_SEC;

  if (durationSec > maxDurationSec) {
    throw new Error(`Browser-recorded trim clips are limited to ${maxDurationSec} seconds.`);
  }

  const offscreenResult = await input.offscreenRecord({
    type: 'GENERATE_PREVIEW_CLIP',
    url: sourceUrl,
    startSec: input.job.selection.trim.startSec,
    durationSec,
    maxDurationSec,
  });

  if (!offscreenResult.ok || !offscreenResult.assetUrl) {
    throw new Error('Offscreen recorder did not return a browser trim asset.');
  }

  const fetchDataUrl = input.fetchDataUrl ?? defaultFetchDataUrl;
  const blob = await fetchDataUrl(offscreenResult.assetUrl);

  return {
    ...(await exportBlobDownload({
      blob,
      filename: trimOutputName(input.candidate.displayName),
      mimeType: 'video/webm',
      saveAs: input.job.selection.saveAs,
      createObjectUrl: input.createObjectUrl,
      revokeObjectUrl: input.revokeObjectUrl,
      download: input.download,
    })),
    notes: ['Browser-recorded WebM clip; not an original-quality stream copy.'],
  };
}
