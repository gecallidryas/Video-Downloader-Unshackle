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
import { isNativeFfmpegUnavailableError } from '@/src/native/native-ffmpeg-client';
import { shouldRouteToYtDlp } from '@/src/background/jobs/native-export-runner';
import type {
  DefaultQualityPolicy,
  OutputFormat,
} from '@/src/background/settings/settings-store';
import { isNonRetryableError } from '@/src/core/download/error-classification';
import type { RestrictionConsentKind } from '@/src/core/policy/restriction-consent';

export interface DownloadControllerSettings {
  defaultOutputFormat?: OutputFormat;
  defaultQualityPolicy?: DefaultQualityPolicy;
  maxConcurrentSegments?: number;
  maxConcurrentSegmentsPerHost?: number;
  maxBandwidthPerHostKBps?: number;
  segmentTimeoutMs?: number;
  enableNativeFeatures?: boolean;
  useNativeFfmpeg?: boolean;
  useNativeYtDlp?: boolean;
  enableBrowserFallbacks?: boolean;
  directRangeMinBytes?: number;
  browserTransmuxWithMuxJs?: boolean;
  browserTransmuxMaxBytes?: number;
  autoDeleteAfterSave?: boolean;
}

export interface DownloadControllerStartOptions {
  selection?: DownloadSelection;
  settings?: DownloadControllerSettings;
  signal?: AbortSignal;
  /** Per-candidate user overrides that unblock protected/geo-restricted media. */
  grantedConsents?: readonly RestrictionConsentKind[];
}

export type RunHlsControllerJob = (input: {
  candidate: MediaCandidate;
  job: DownloadJob;
  manifest: ParsedHlsManifest;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  bandwidthBytesPerSecond?: number;
  segmentTimeoutMs?: number;
  qualityPolicy?: DefaultQualityPolicy;
  browserTransmuxWithMuxJs?: boolean;
  browserTransmuxMaxBytes?: number;
  signal?: AbortSignal;
}) => Promise<JobOutput>;

export type RunDashControllerJob = (input: {
  candidate: MediaCandidate;
  job: DownloadJob;
  manifest: ParsedDashManifest;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  bandwidthBytesPerSecond?: number;
  segmentTimeoutMs?: number;
  signal?: AbortSignal;
}) => Promise<JobOutput>;

export type RunNativeExportControllerJob = (input: {
  candidate: MediaCandidate;
  job: DownloadJob;
}) => Promise<JobOutput>;

export type RunBrowserDirectTrimControllerJob = (input: {
  candidate: MediaCandidate;
  job: DownloadJob;
}) => Promise<JobOutput>;

export interface DirectRangeProbeResult {
  acceptsRanges: boolean;
  contentLength?: number;
}

export type ProbeDirectRangeSupport = (
  url: string,
  signal?: AbortSignal,
) => Promise<DirectRangeProbeResult>;

export type RunDirectRangeControllerJob = (input: {
  candidate: MediaCandidate;
  job: DownloadJob;
  bandwidthBytesPerSecond?: number;
  signal?: AbortSignal;
}) => Promise<JobOutput>;

export interface DownloadControllerOptions {
  downloadFile: DirectDownloadFile;
  downloadDirectWithRanges?: RunDirectRangeControllerJob;
  runHls: RunHlsControllerJob;
  runDash: RunDashControllerJob;
  nativeExport?: RunNativeExportControllerJob;
  browserDirectTrim?: RunBrowserDirectTrimControllerJob;
  probeDirectRange?: ProbeDirectRangeSupport;
  fetchText?: (url: string, init: RequestInit) => Promise<string>;
  cancelDownload?: (downloadId: number) => Promise<void>;
  cleanupAfterSave?: (jobId: string) => Promise<void>;
  now?: () => number;
  suppressProtectedDownloads?: boolean;
  enableNativeFeatures?: boolean;
  useNativeFfmpeg?: boolean;
  useNativeYtDlp?: boolean;
  enableBrowserFallbacks?: boolean;
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
  const assemblyFailure = /assembl|blob|raw .*export|transmux/i.test(message);
  const nonRetryable = isNonRetryableError(error);

  return {
    code: protectedMedia
      ? 'PROTECTED_MEDIA'
      : assemblyFailure
        ? 'ASSEMBLY_ERROR'
        : 'NETWORK_ERROR',
    message,
    retryable: !protectedMedia && !nonRetryable,
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

async function defaultProbeDirectRange(
  url: string,
  signal?: AbortSignal,
): Promise<DirectRangeProbeResult> {
  const response = await fetch(url, {
    method: 'HEAD',
    cache: 'no-store',
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    return { acceptsRanges: false };
  }

  const contentLength = Number(response.headers.get('Content-Length'));

  return {
    acceptsRanges: response.headers.get('Accept-Ranges')?.toLowerCase() === 'bytes',
    ...(Number.isFinite(contentLength) && contentLength > 0 ? { contentLength } : {}),
  };
}

function selectionForJob(
  job: DownloadJob,
  options: DownloadControllerStartOptions,
): DownloadSelection {
  const selection: DownloadSelection = {
    ...job.selection,
    ...options.selection,
  };
  const defaultOutputFormat = options.settings?.defaultOutputFormat;

  if (selection.outputKind === undefined && defaultOutputFormat && defaultOutputFormat !== 'auto') {
    selection.outputKind = defaultOutputFormat === 'mp3' ? 'audio-only' : defaultOutputFormat;
  }

  if (options.settings?.defaultQualityPolicy === 'highest') {
    const { variantId: _variantId, ...rest } = selection;
    return { ...rest, mode: 'best' };
  }

  if (options.settings?.defaultQualityPolicy === 'lowest') {
    const { variantId: _variantId, ...rest } = selection;
    return { ...rest, mode: 'smallest' };
  }

  return selection;
}

function hasTrim(selection: DownloadSelection): boolean {
  const trim = selection.trim;

  return Boolean(
    (trim?.startSec !== undefined && trim.startSec > 0) ||
      (trim?.endSec !== undefined && trim.endSec > 0),
  );
}

async function shouldUseDirectRangeDownload(input: {
  candidate: MediaCandidate;
  selection: DownloadSelection;
  settings: DownloadControllerSettings;
  signal?: AbortSignal;
  probeDirectRange: ProbeDirectRangeSupport;
}): Promise<boolean> {
  if (
    input.candidate.protocol !== 'direct' ||
    !input.candidate.sourceUrl ||
    isProtected(input.candidate) ||
    hasTrim(input.selection) ||
    input.settings.enableBrowserFallbacks === false
  ) {
    return false;
  }

  const minBytes = Math.max(1, input.settings.directRangeMinBytes ?? 50 * 1024 * 1024);
  const probe = await input.probeDirectRange(input.candidate.sourceUrl, input.signal);

  return probe.acceptsRanges && (probe.contentLength ?? 0) >= minBytes;
}

export function createDownloadController(options: DownloadControllerOptions) {
  const fetchText = options.fetchText ?? defaultFetchText;
  const probeDirectRange = options.probeDirectRange ?? defaultProbeDirectRange;
  const now = options.now ?? Date.now;
  const cancelDownload =
    options.cancelDownload ??
    (async (downloadId: number) => {
      await chrome.downloads.cancel(downloadId);
    });
  let suppressProtectedDownloads = options.suppressProtectedDownloads;
  let controllerSettings: DownloadControllerSettings = {
    browserTransmuxWithMuxJs: true,
    browserTransmuxMaxBytes: 150 * 1024 * 1024,
    ...(options.enableNativeFeatures !== undefined
      ? { enableNativeFeatures: options.enableNativeFeatures }
      : {}),
    ...(options.useNativeFfmpeg !== undefined
      ? { useNativeFfmpeg: options.useNativeFfmpeg }
      : {}),
    ...(options.useNativeYtDlp !== undefined
      ? { useNativeYtDlp: options.useNativeYtDlp }
      : {}),
    ...(options.enableBrowserFallbacks !== undefined
      ? { enableBrowserFallbacks: options.enableBrowserFallbacks }
      : {}),
  };
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
    const protectedConsent = startOptions.grantedConsents?.includes('protected') ?? false;
    const allowProtected = suppressProtectedDownloads === false || protectedConsent;

    if (!allowProtected && isProtected(candidate)) {
      throw new Error('Protected media cannot be downloaded by the generic pipeline.');
    }

    const settings = {
      ...controllerSettings,
      ...startOptions.settings,
    };
    const enableNativeFeatures = settings.enableNativeFeatures ?? true;
    const enableBrowserFallbacks = settings.enableBrowserFallbacks ?? true;
    // Per-engine gates under the native master toggle. Default on so existing
    // behavior is unchanged; turning one off forces the other engine (or the
    // browser fallback) to handle the job.
    const useNativeYtDlp = enableNativeFeatures && (settings.useNativeYtDlp ?? true);
    const useNativeFfmpeg = enableNativeFeatures && (settings.useNativeFfmpeg ?? true);
    const selection = selectionForJob(job, {
      ...startOptions,
      settings,
    });
    const controllerJob: DownloadJob = {
      ...job,
      selection,
    };
    const jobSignal = registerSignal(controllerJob.id, startOptions.signal);

    try {
      // Page/site candidates (no raw media URL) go to the yt-dlp native engine.
      // There is no browser fallback for these, so a disabled/unavailable engine
      // surfaces a clear error directly rather than silently failing over.
      if (shouldRouteToYtDlp(candidate)) {
        if (useNativeYtDlp && options.nativeExport) {
          return await options.nativeExport({ candidate, job: controllerJob });
        }
        throw new Error(
          'This page needs the yt-dlp engine, which is disabled or unavailable. Enable native features and the yt-dlp engine in settings.',
        );
      }

      if (candidate.protocol === 'direct') {
        if (
          hasTrim(selection) &&
          selection.outputKind === 'webm' &&
          enableBrowserFallbacks &&
          options.browserDirectTrim
        ) {
          return await options.browserDirectTrim({ candidate, job: controllerJob });
        }

        if (hasTrim(selection) && useNativeFfmpeg && options.nativeExport) {
          try {
            return await options.nativeExport({ candidate, job: controllerJob });
          } catch (error) {
            if (!isNativeFfmpegUnavailableError(error)) {
              throw error;
            }
            if (!enableBrowserFallbacks) {
              throw error;
            }
          }
        }

        if (hasTrim(selection) && !enableBrowserFallbacks) {
          throw new Error('Browser fallback downloads are disabled in settings.');
        }

        if (
          options.downloadDirectWithRanges &&
          (await shouldUseDirectRangeDownload({
            candidate,
            selection,
            settings,
            signal: jobSignal,
            probeDirectRange,
          }))
        ) {
          return options.downloadDirectWithRanges({
            candidate,
            job: controllerJob,
            signal: jobSignal,
            ...(settings.maxBandwidthPerHostKBps !== undefined &&
            settings.maxBandwidthPerHostKBps > 0
              ? { bandwidthBytesPerSecond: settings.maxBandwidthPerHostKBps * 1024 }
              : {}),
          });
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

      if (useNativeFfmpeg && options.nativeExport) {
        try {
          return await options.nativeExport({ candidate, job: controllerJob });
        } catch (error) {
          if (!isNativeFfmpegUnavailableError(error)) {
            throw error;
          }
          if (!enableBrowserFallbacks) {
            throw error;
          }
        }
      }

      if (!enableBrowserFallbacks) {
        throw new Error('Browser fallback downloads are disabled in settings.');
      }

      const manifestText = await fetchText(manifestUrl, {
        cache: 'no-store',
        credentials: 'include',
        signal: jobSignal,
      });

      const concurrencyFields: {
        concurrency?: number;
        maxConcurrentPerHost?: number;
        bandwidthBytesPerSecond?: number;
        segmentTimeoutMs?: number;
      } = {};

      if (settings.maxConcurrentSegments !== undefined) {
        concurrencyFields.concurrency = settings.maxConcurrentSegments;
      }

      if (settings.maxConcurrentSegmentsPerHost !== undefined) {
        concurrencyFields.maxConcurrentPerHost = settings.maxConcurrentSegmentsPerHost;
      }

      if (
        settings.maxBandwidthPerHostKBps !== undefined &&
        settings.maxBandwidthPerHostKBps > 0
      ) {
        concurrencyFields.bandwidthBytesPerSecond =
          settings.maxBandwidthPerHostKBps * 1024;
      }

      if (settings.segmentTimeoutMs !== undefined) {
        concurrencyFields.segmentTimeoutMs = settings.segmentTimeoutMs;
      }

      if (candidate.protocol === 'hls') {
        return await options.runHls({
          candidate,
          job: controllerJob,
          manifest: parseHlsManifest({ manifestUrl, content: manifestText }),
          allowProtected,
          signal: jobSignal,
          qualityPolicy: settings.defaultQualityPolicy,
          browserTransmuxWithMuxJs: settings.browserTransmuxWithMuxJs,
          browserTransmuxMaxBytes: settings.browserTransmuxMaxBytes,
          ...concurrencyFields,
        });
      }

      if (candidate.protocol === 'dash') {
        return await options.runDash({
          candidate,
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
    const settings = {
      ...controllerSettings,
      ...managedOptions.settings,
    };

    try {
      managedOptions.jobStore.update(job.id, { phase: 'preparing' });
      const output = await start(candidate, job, {
        ...managedOptions,
        settings,
      });
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

      if (settings.autoDeleteAfterSave) {
        await options.cleanupAfterSave?.(job.id);
      }

      return completed;
    } catch (error) {
      const phase = managedOptions.jobStore.get(job.id)?.phase;
      // A pause or cancel deliberately aborted this run; rethrow without
      // overwriting the deliberate phase with 'failed'.
      if (phase === 'cancelled' || phase === 'paused') {
        throw error;
      }

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

  // Pure abort of the in-flight controller run for a job. Unlike `abort`, this
  // does NOT touch the jobStore — the queue owns the resulting phase (e.g.
  // 'paused'). Used to wire `queue.pause` to real cancellation of work.
  function signalAbort(jobId: string): void {
    const activeController = activeAbortControllers.get(jobId);

    if (activeController) {
      activeController.abort(new DOMException('Cancelled by user', 'AbortError'));
      activeAbortControllers.delete(jobId);
    }
  }

  function updateSettings(
    patch: Pick<DownloadControllerOptions, 'suppressProtectedDownloads'> &
      Partial<DownloadControllerSettings>,
  ): void {
    if (patch.suppressProtectedDownloads !== undefined) {
      suppressProtectedDownloads = patch.suppressProtectedDownloads;
    }
    controllerSettings = {
      ...controllerSettings,
      ...(patch.defaultOutputFormat !== undefined
        ? { defaultOutputFormat: patch.defaultOutputFormat }
        : {}),
      ...(patch.defaultQualityPolicy !== undefined
        ? { defaultQualityPolicy: patch.defaultQualityPolicy }
        : {}),
      ...(patch.maxConcurrentSegments !== undefined
        ? { maxConcurrentSegments: patch.maxConcurrentSegments }
        : {}),
      ...(patch.maxConcurrentSegmentsPerHost !== undefined
        ? { maxConcurrentSegmentsPerHost: patch.maxConcurrentSegmentsPerHost }
        : {}),
      ...(patch.maxBandwidthPerHostKBps !== undefined
        ? { maxBandwidthPerHostKBps: patch.maxBandwidthPerHostKBps }
        : {}),
      ...(patch.segmentTimeoutMs !== undefined
        ? { segmentTimeoutMs: patch.segmentTimeoutMs }
        : {}),
      ...(patch.enableNativeFeatures !== undefined
        ? { enableNativeFeatures: patch.enableNativeFeatures }
        : {}),
      ...(patch.useNativeFfmpeg !== undefined
        ? { useNativeFfmpeg: patch.useNativeFfmpeg }
        : {}),
      ...(patch.useNativeYtDlp !== undefined
        ? { useNativeYtDlp: patch.useNativeYtDlp }
        : {}),
      ...(patch.enableBrowserFallbacks !== undefined
        ? { enableBrowserFallbacks: patch.enableBrowserFallbacks }
        : {}),
      ...(patch.directRangeMinBytes !== undefined
        ? { directRangeMinBytes: patch.directRangeMinBytes }
        : {}),
      ...(patch.browserTransmuxWithMuxJs !== undefined
        ? { browserTransmuxWithMuxJs: patch.browserTransmuxWithMuxJs }
        : {}),
      ...(patch.browserTransmuxMaxBytes !== undefined
        ? { browserTransmuxMaxBytes: patch.browserTransmuxMaxBytes }
        : {}),
      ...(patch.autoDeleteAfterSave !== undefined
        ? { autoDeleteAfterSave: patch.autoDeleteAfterSave }
        : {}),
    };
  }

  return {
    start,
    runManaged,
    abort,
    signalAbort,
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
