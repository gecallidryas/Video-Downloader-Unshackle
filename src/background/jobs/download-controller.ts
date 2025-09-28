import type {
  DownloadJob,
  DownloadSelection,
  JobFailure,
  JobOutput,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import {
  createFailedHistoryRecord,
  historyRecordFromCompletedJob,
  type HistoryStore,
} from './history-store';
import type { JobStore } from './job-store';
import type { DirectDownloadFile } from '@/src/core/direct/start-direct-download';
import { parseHlsManifest, type ParsedHlsManifest } from '@/src/core/hls/parse-hls-manifest';
import { parseMpd, type ParsedDashManifest } from '@/src/core/dash/parse-mpd';
import { runHlsJob } from '@/src/core/hls/run-hls-job';
import { runDashJob } from '@/src/core/dash/run-dash-job';

export interface DownloadControllerSettings {
  defaultOutputFormat?: DownloadSelection['outputKind'];
  maxConcurrentSegments?: number;
  maxConcurrentSegmentsPerHost?: number;
  segmentTimeoutMs?: number;
}

export interface DownloadControllerStartOptions {
  selection?: DownloadSelection;
  settings?: DownloadControllerSettings;
  signal?: AbortSignal;
}

export type RunHlsControllerJob = (input: {
  job: DownloadJob;
  manifest: ParsedHlsManifest;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  segmentTimeoutMs?: number;
  signal?: AbortSignal;
}) => Promise<JobOutput>;

export type RunDashControllerJob = (input: {
  job: DownloadJob;
  manifest: ParsedDashManifest;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  segmentTimeoutMs?: number;
  signal?: AbortSignal;
}) => Promise<JobOutput>;

export type RunNativeExportControllerJob = (input: {
  candidate: MediaCandidate;
  job: DownloadJob;
}) => Promise<JobOutput>;

export interface DownloadControllerOptions {
  downloadFile: DirectDownloadFile;
  runHls: RunHlsControllerJob;
  runDash: RunDashControllerJob;
  nativeExport?: RunNativeExportControllerJob;
  fetchText?: (url: string, init: RequestInit) => Promise<string>;
  cancelDownload?: (downloadId: number) => Promise<void>;
  now?: () => number;
  suppressProtectedDownloads?: boolean;
}

export interface ManagedDownloadOptions extends DownloadControllerStartOptions {
  jobStore: JobStore;
  historyStore: HistoryStore;
}

// Note: geo-restricted candidates have status='unsupported' (not 'protected') and are
// not blocked by this gate — they proceed into the pipeline and fail at network fetch time.
function isProtected(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'unknown' ||
    candidate.protection.kind === 'sample-aes'
  );
}

function failureFromError(error: unknown): JobFailure {
  const message = error instanceof Error ? error.message : 'Download failed';
  const protectedMedia = /protected media|drm|sample-aes/i.test(message);

  return {
    code: protectedMedia ? 'PROTECTED_MEDIA' : 'NETWORK_ERROR',
    message,
    retryable: !protectedMedia,
    detail: error,
  };
}

async function defaultFetchText(url: string, init: RequestInit): Promise<string> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.status}`);
  }

  return response.text();
}

function selectionForJob(
  job: DownloadJob,
  options: DownloadControllerStartOptions,
): DownloadSelection {
  return {
    ...job.selection,
    outputKind: options.settings?.defaultOutputFormat ?? job.selection.outputKind,
    ...options.selection,
  };
}

function hasTrim(selection: DownloadSelection): boolean {
  const trim = selection.trim;

  return Boolean(
    (trim?.startSec !== undefined && trim.startSec > 0) ||
      (trim?.endSec !== undefined && trim.endSec > 0),
  );
}

export function createDownloadController(options: DownloadControllerOptions) {
  const fetchText = options.fetchText ?? defaultFetchText;
  const now = options.now ?? Date.now;
  const cancelDownload =
    options.cancelDownload ??
    (async (downloadId: number) => {
      await chrome.downloads.cancel(downloadId);
    });
  let suppressProtectedDownloads = options.suppressProtectedDownloads;
  const activeAbortControllers = new Map<string, AbortController>();

  function registerSignal(
    jobId: string,
    externalSignal?: AbortSignal,
  ): AbortSignal {
    const controller = new AbortController();
    activeAbortControllers.set(jobId, controller);

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener(
          'abort',
          () => controller.abort(externalSignal.reason),
          { once: true },
        );
      }
    }

    return controller.signal;
  }

  function releaseSignal(jobId: string): void {
    activeAbortControllers.delete(jobId);
  }

  async function start(
    candidate: MediaCandidate,
    job: DownloadJob,
    startOptions: DownloadControllerStartOptions = {},
  ): Promise<JobOutput> {
    const allowProtected = suppressProtectedDownloads === false;

    if (!allowProtected && isProtected(candidate)) {
      throw new Error('Protected media cannot be downloaded by the generic pipeline.');
    }

    const selection = selectionForJob(job, startOptions);
    const controllerJob: DownloadJob = {
      ...job,
      selection,
    };
    const jobSignal = registerSignal(controllerJob.id, startOptions.signal);

    try {
      if (candidate.protocol === 'direct') {
        if (hasTrim(selection) && options.nativeExport) {
          return await options.nativeExport({ candidate, job: controllerJob });
        }

        const output = await options.downloadFile(candidate, controllerJob);

        return {
          ...output,
          ...(hasTrim(selection)
            ? {
                notes: [
                  'Trim is not supported for direct downloads yet; downloaded the full file.',
                ],
              }
            : {}),
        };
      }

      const manifestUrl = candidate.manifestUrl ?? candidate.sourceUrl;

      if (!manifestUrl) {
        throw new Error('Missing manifest URL.');
      }

      if (options.nativeExport) {
        return await options.nativeExport({ candidate, job: controllerJob });
      }

      const manifestText = await fetchText(manifestUrl, {
        cache: 'no-store',
        credentials: 'include',
        signal: jobSignal,
      });

      const concurrencyFields: {
        concurrency?: number;
        maxConcurrentPerHost?: number;
        segmentTimeoutMs?: number;
      } = {};

      if (startOptions.settings?.maxConcurrentSegments !== undefined) {
        concurrencyFields.concurrency = startOptions.settings.maxConcurrentSegments;
      }

      if (startOptions.settings?.maxConcurrentSegmentsPerHost !== undefined) {
        concurrencyFields.maxConcurrentPerHost = startOptions.settings.maxConcurrentSegmentsPerHost;
      }

      if (startOptions.settings?.segmentTimeoutMs !== undefined) {
        concurrencyFields.segmentTimeoutMs = startOptions.settings.segmentTimeoutMs;
      }

      if (candidate.protocol === 'hls') {
        return await options.runHls({
          job: controllerJob,
          manifest: parseHlsManifest({ manifestUrl, content: manifestText }),
          allowProtected,
          signal: jobSignal,
          ...concurrencyFields,
        });
      }

      if (candidate.protocol === 'dash') {
        return await options.runDash({
          job: controllerJob,
          manifest: parseMpd({ manifestUrl, content: manifestText }),
          allowProtected,
          signal: jobSignal,
          ...concurrencyFields,
        });
      }

      throw new Error(`Unsupported protocol: ${candidate.protocol}`);
    } finally {
      releaseSignal(controllerJob.id);
    }
  }

  async function runManaged(
    candidate: MediaCandidate,
    job: DownloadJob,
    managedOptions: ManagedDownloadOptions,
  ): Promise<DownloadJob> {
    try {
      managedOptions.jobStore.update(job.id, { phase: 'preparing' });
      const output = await start(candidate, job, managedOptions);
      const completed = managedOptions.jobStore.update(job.id, {
        phase: 'completed',
        progressPct: 100,
        bytesDownloaded: output.sizeBytes ?? job.bytesDownloaded,
        output,
        updatedAt: now(),
      });

      managedOptions.historyStore.upsert(
        historyRecordFromCompletedJob(candidate, completed, now),
      );

      return completed;
    } catch (error) {
      const failed = managedOptions.jobStore.update(job.id, {
        phase: 'failed',
        failure: failureFromError(error),
        updatedAt: now(),
      });

      managedOptions.historyStore.upsert(
        createFailedHistoryRecord(candidate, failed, now),
      );

      throw error;
    }
  }

  async function abort(
    jobId: string,
    dependencies: { jobStore: JobStore },
  ): Promise<{ cancelled: boolean; downloadId?: number }> {
    const job = dependencies.jobStore.get(jobId);
    const downloadId = job?.output?.downloadId;

    if (!job) {
      return { cancelled: false };
    }

    const activeController = activeAbortControllers.get(jobId);

    if (activeController) {
      activeController.abort(new DOMException('Cancelled by user', 'AbortError'));
      activeAbortControllers.delete(jobId);
    }

    if (typeof downloadId === 'number') {
      await cancelDownload(downloadId);
    }

    dependencies.jobStore.update(jobId, {
      phase: 'cancelled',
      failure: {
        code: 'USER_CANCELLED',
        message: 'Cancelled by user',
        retryable: false,
      },
    });

    return {
      cancelled: true,
      ...(typeof downloadId === 'number' ? { downloadId } : {}),
    };
  }

  function updateSettings(
    patch: Pick<DownloadControllerOptions, 'suppressProtectedDownloads'>,
  ): void {
    if (patch.suppressProtectedDownloads !== undefined) {
      suppressProtectedDownloads = patch.suppressProtectedDownloads;
    }
  }

  return {
    start,
    runManaged,
    abort,
    updateSettings,
  };
}

/**
 * Safe-by-default dev stub controller.
 *
 * This controller is created without a `suppressProtectedDownloads` option, so
 * `allowProtected` will always be `false` and protected candidates will be
 * rejected before any network activity. It is NOT wired into production — it
 * exists only as a convenient default for development and testing.
 *
 * Production code must construct a controller via `createDownloadController`
 * and pass `suppressProtectedDownloads` derived from the user's actual settings.
 */
export const defaultDownloadController = createDownloadController({
  downloadFile: async (candidate) => ({
    fileName: candidate.displayName,
    mimeType: candidate.mimeType ?? 'application/octet-stream',
    outputUrl: candidate.sourceUrl,
  }),
  runHls: (input) =>
    runHlsJob({
      ...input,
      fetchSegment: async () => new Uint8Array(),
      writeOutput: async () => ({
        fileName: 'hls-output.mp4',
        mimeType: 'video/mp4',
      }),
      allowProtected: input.allowProtected,
    }),
  runDash: (input) =>
    runDashJob({
      ...input,
      fetchSegment: async () => new Uint8Array(),
      writeOutput: async () => ({
        fileName: 'dash-output.mp4',
        mimeType: 'video/mp4',
      }),
      allowProtected: input.allowProtected,
    }),
});
