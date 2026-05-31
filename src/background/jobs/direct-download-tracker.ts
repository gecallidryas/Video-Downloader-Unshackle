import type { JobFailure } from '@/video_downloader_types_skeleton';
import type { JobStore } from './job-store';

export interface DirectDownloadTrackerOptions {
  jobStore: JobStore;
}

export interface DirectDownloadTracker {
  /** Associate a chrome.downloads downloadId with the job that owns it. */
  track(downloadId: number, jobId: string): void;
  /** Forget a downloadId (e.g. when the credential-replay rule is released). */
  untrack(downloadId: number): void;
  /** Apply a chrome.downloads.onChanged delta to the tracked job, if any. */
  handleChange(delta: chrome.downloads.DownloadDelta): void;
}

function interruptionFailure(reason: string | undefined): JobFailure {
  const detail = reason && reason.trim().length > 0 ? reason : 'unknown';

  return {
    code: 'NETWORK_ERROR',
    message: `Browser download was interrupted (${detail}).`,
    // chrome.downloads interruptions (server/network errors) are generally
    // worth a retry; user cancellations terminate via the abort path instead.
    retryable: true,
  };
}

/**
 * Direct (fire-and-forget) downloads go through `chrome.downloads.download`,
 * which resolves with a downloadId before any bytes transfer. The controller
 * therefore marks the job `completed` optimistically. This tracker watches the
 * matching `onChanged` deltas and flips the job to `failed` if the transfer is
 * later interrupted, so a server/network error is surfaced instead of a false
 * "completed" state. A `complete` delta is left untouched.
 */
export function createDirectDownloadTracker(
  options: DirectDownloadTrackerOptions,
): DirectDownloadTracker {
  const jobByDownloadId = new Map<number, string>();

  return {
    track(downloadId, jobId) {
      jobByDownloadId.set(downloadId, jobId);
    },

    untrack(downloadId) {
      jobByDownloadId.delete(downloadId);
    },

    handleChange(delta) {
      const state = delta.state?.current;
      if (state !== 'complete' && state !== 'interrupted') {
        return;
      }

      const jobId = jobByDownloadId.get(delta.id);
      if (jobId === undefined) {
        return;
      }
      jobByDownloadId.delete(delta.id);

      if (state === 'complete') {
        return;
      }

      const job = options.jobStore.get(jobId);
      // A deliberate cancel/pause already set a terminal phase; do not clobber it.
      if (!job || job.phase === 'cancelled' || job.phase === 'paused') {
        return;
      }

      options.jobStore.update(jobId, {
        phase: 'failed',
        failure: interruptionFailure(delta.error?.current),
      });
    },
  };
}
