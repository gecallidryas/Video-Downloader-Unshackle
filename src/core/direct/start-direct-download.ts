import type {
  DownloadJob,
  DownloadSelection,
  JobFailure,
  JobOutput,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import type { HistoryStore } from '@/src/background/jobs/history-store';
import {
  createFailedHistoryRecord,
  historyRecordFromCompletedJob,
} from '@/src/background/jobs/history-store';
import type { JobStore } from '@/src/background/jobs/job-store';
import { probeDirectMedia } from './probe-direct-media';

export type DirectDownloadFile = (
  candidate: MediaCandidate,
  job: DownloadJob,
) => Promise<JobOutput>;

export interface StartDirectDownloadOptions {
  jobStore: JobStore;
  historyStore: HistoryStore;
  selection?: DownloadSelection;
  downloadFile?: DirectDownloadFile;
  now?: () => number;
}

function validateDirectCandidate(candidate: MediaCandidate): void {
  if (
    candidate.protocol !== 'direct' ||
    candidate.status !== 'ready' ||
    !candidate.sourceUrl ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'unknown'
  ) {
    throw new Error('Only ready direct media candidates can start direct downloads.');
  }
}

function failureFromError(error: unknown): JobFailure {
  return {
    code: 'NETWORK_ERROR',
    message: error instanceof Error ? error.message : 'Direct download failed',
    retryable: true,
    detail: error,
  };
}

async function defaultDownloadFile(
  candidate: MediaCandidate,
): Promise<JobOutput> {
  const probe = probeDirectMedia(candidate);
  const downloads = globalThis.chrome?.downloads;

  if (downloads?.download) {
    const downloadId = await downloads.download({
      url: probe.url,
      filename: probe.fileName,
      saveAs: false,
    });

    return {
      fileName: probe.fileName,
      mimeType: probe.mimeType,
      outputUrl: probe.url,
      downloadId,
    };
  }

  return {
    fileName: probe.fileName,
    mimeType: probe.mimeType,
    outputUrl: probe.url,
  };
}

export async function startDirectDownload(
  candidate: MediaCandidate,
  options: StartDirectDownloadOptions,
): Promise<DownloadJob> {
  validateDirectCandidate(candidate);

  const now = options.now ?? Date.now;
  const job = options.jobStore.create(candidate, options.selection);
  const downloadFile = options.downloadFile ?? defaultDownloadFile;

  try {
    const output = await downloadFile(candidate, job);
    const completedJob = options.jobStore.update(job.id, {
      phase: 'completed',
      progressPct: 100,
      bytesDownloaded: output.sizeBytes ?? job.bytesDownloaded,
      output,
      updatedAt: now(),
    });

    options.historyStore.upsert(
      historyRecordFromCompletedJob(candidate, completedJob, now),
    );

    return completedJob;
  } catch (error) {
    const failedJob = options.jobStore.update(job.id, {
      phase: 'failed',
      failure: failureFromError(error),
      updatedAt: now(),
    });

    options.historyStore.upsert(
      createFailedHistoryRecord(candidate, failedJob, now),
    );

    throw error;
  }
}
