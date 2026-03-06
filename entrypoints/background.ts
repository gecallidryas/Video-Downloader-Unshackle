import { defineBackground } from 'wxt/utils/define-background';
import type {
  JobSegmentStatus,
  MediaCandidate,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
import { createCandidateRegistry } from '@/src/background/candidates/candidate-registry';
import { createContextMenuManager } from '@/src/background/context-menu/context-menu';
import { createDownloadController } from '@/src/background/jobs/download-controller';
import { cleanupJobStorage } from '@/src/background/jobs/cleanup-job-storage';
import { createDownloadQueue } from '@/src/background/jobs/download-queue';
import { createHistoryStore } from '@/src/background/jobs/history-store';
import { createJobStore } from '@/src/background/jobs/job-store';
import { createOffscreenManager } from '@/src/background/offscreen/offscreen-manager';
import { createNotificationManager } from '@/src/background/notifications/notification-manager';
import { createDetectionNotifier } from '@/src/background/notifications/detection-notifier';
import { saveDetectionsOnTabClose } from '@/src/background/state/previous-detections';
import {
  SETTINGS_STORAGE_KEY,
  createSettingsStore,
  type UnifiedSettings,
} from '@/src/background/settings/settings-store';
import { runBrowserDashExportJob } from '@/src/background/jobs/browser-dash-runner';
import { runBrowserDirectTrimJob } from '@/src/background/jobs/browser-direct-trim-runner';
import { runBrowserHlsExportJob } from '@/src/background/jobs/browser-hls-runner';
import { runNativeExportJob } from '@/src/background/jobs/native-export-runner';
import {
  createRuntimeRouter,
  registerRuntimeRouter,
} from '@/src/background/messaging/runtime-router';
import {
  createRequestJournal,
  registerPassiveRequestJournal,
} from '@/src/background/network/request-journal';
import { createHeaderContextStore } from '@/src/background/network/header-context';
import { registerBackgroundCommandHandlers } from '@/src/background/commands/background-commands';
import { createAutoScanController } from '@/src/background/scanning/auto-scan';
import { createTabSnapshotStore } from '@/src/background/state/tab-snapshots';
import { createTabVideoStatusStore } from '@/src/background/state/tab-video-status';
import { getSidePanelBehavior } from '@/src/lib/chrome/sidePanel';
import { probeDirectMedia } from '@/src/core/direct/probe-direct-media';
import { downloadDirectWithRanges } from '@/src/core/download/range-splitter';
import {
  createNativeFfmpegClient,
  type NativeFfmpegClient,
} from '@/src/native/native-ffmpeg-client';
import { ensurePreviewClip } from '@/src/core/preview/native-preview-service';
import { ensureNativeThumbnail } from '@/src/core/thumbs/native-thumbnail-service';
import { createBucketMetadataStore } from '@/src/core/storage/bucket-metadata-store';
import {
  createFileSystemAccessStore,
  loadPersistedOutputDirectoryHandle,
  type FileSystemAccessStore,
} from '@/src/core/storage/file-system-access-store';
import { createIndexedDbFragmentStore } from '@/src/core/storage/indexeddb-fragment-store';
import { createInMemorySubtitleStore } from '@/src/core/storage/subtitle-store';
import { detectStreamingWriteCapabilities } from '@/src/core/capabilities/streaming-write-capabilities';
import type { SegmentProgressEvent } from '@/src/core/download/progress-events';

export function initializeBackgroundShell() {
  const candidateRegistry = createCandidateRegistry();
  const requestJournal = createRequestJournal();
  const headerContext = createHeaderContextStore();
  const settingsStore = createSettingsStore();
  const jobStore = createJobStore();
  const historyStore = createHistoryStore();
  const fragmentStore = createIndexedDbFragmentStore();
  const bucketMetadataStore = createBucketMetadataStore();
  const subtitleStore = createInMemorySubtitleStore();
  const tabSnapshots = createTabSnapshotStore();
  const tabVideoStatus = createTabVideoStatusStore();
  let nativeClient: NativeFfmpegClient | undefined;
  let fileSystemAccessStore: FileSystemAccessStore | undefined;
  const offscreenManager = createOffscreenManager();

  function getNativeClient(): NativeFfmpegClient {
    nativeClient ??= createNativeFfmpegClient();
    return nativeClient;
  }

  function initializeHlsSegmentStatuses(jobId: string, plan: SegmentPlan): void {
    jobStore.update(jobId, {
      totalSegments: plan.segments.length,
      selectedSegmentRange: plan.segments.length > 0
        ? {
            start: Math.min(...plan.segments.map((segment) => segment.index)),
            end: Math.max(...plan.segments.map((segment) => segment.index)),
          }
        : undefined,
      hlsTimelinePolicy: jobStore.get(jobId)?.selection.hlsTimelinePolicy ?? 'full',
      segmentStatuses: plan.segments.map<JobSegmentStatus>((segment) => ({
        index: segment.index,
        url: segment.url,
        status: 'pending',
      })),
    });
  }

  function updateHlsSegmentProgress(jobId: string, event: SegmentProgressEvent): void {
    const job = jobStore.get(jobId);

    if (!job) {
      return;
    }

    const segmentStatuses = job.segmentStatuses ?? [];
    const nextStatuses = event.segment
      ? segmentStatuses.map((segment) =>
          segment.index === event.segment?.index
            ? {
                ...segment,
                status: event.status ?? segment.status,
                updatedAt: Date.now(),
              }
            : segment,
        )
      : segmentStatuses;
    const completed = event.downloaded + event.failed;
    const progressPct =
      event.total > 0 ? Math.round((completed / event.total) * 100) : job.progressPct;

    jobStore.update(jobId, {
      progressPct,
      currentSegment: event.segment?.index ?? job.currentSegment,
      totalSegments: event.total,
      segmentStatuses: nextStatuses,
    });
  }

  async function getDirectToDiskWriter():
    Promise<((filename: string, data: Uint8Array) => Promise<void>) | undefined> {
    if (!settingsStore.get('useDirectToDisk')) {
      return undefined;
    }

    const directoryHandle = await loadPersistedOutputDirectoryHandle();
    const environment = globalThis as {
      WritableStream?: unknown;
      navigator?: { storage?: { getDirectory?: unknown } };
    };
    const capabilities = detectStreamingWriteCapabilities({
      WritableStream: environment.WritableStream,
      navigator: environment.navigator,
      persistedOutputDirectory: Boolean(directoryHandle),
    });

    if (!capabilities.persistedOutputDirectory || !directoryHandle) {
      return undefined;
    }

    fileSystemAccessStore = createFileSystemAccessStore({
      initialDirectoryHandle: directoryHandle,
    });

    if (!(await fileSystemAccessStore.verifyWritePermission())) {
      return undefined;
    }

    return (filename, data) => fileSystemAccessStore?.writeFile(filename, data) ?? Promise.resolve();
  }

  function applyLoadedSettings(settings: UnifiedSettings): void {
    headerContext.updateOptions({
      captureCredentialHeaders: settings.advancedMode && settings.captureCredentialHeaders,
    });
    requestJournal.updateCaptureRules({
      customExtensions: settings.captureRuleCustomExtensions,
      customContentTypes: settings.captureRuleCustomContentTypes,
      blacklist: settings.captureRuleUrlBlacklist,
      minSizeBytes: settings.captureRuleMinSizeBytes,
      sizePredicate: settings.captureRuleSizePredicate,
      regexRules: settings.captureRuleRegexRules,
    });
    downloadController.updateSettings({
      suppressProtectedDownloads: settings.suppressProtectedDownloads,
      defaultOutputFormat: settings.defaultOutputFormat,
      defaultQualityPolicy: settings.defaultQualityPolicy,
      maxConcurrentSegments: settings.maxConcurrentSegments,
      maxConcurrentSegmentsPerHost: settings.maxConcurrentSegmentsPerHost,
      segmentTimeoutMs: settings.segmentTimeoutMs,
      enableNativeFeatures: settings.enableNativeFeatures,
      enableBrowserFallbacks: settings.enableBrowserFallbacks,
      browserTransmuxWithMuxJs: settings.browserTransmuxWithMuxJs,
      browserTransmuxMaxBytes: settings.browserTransmuxMaxBytes,
      autoDeleteAfterSave: settings.autoDeleteAfterSave,
    });
    notificationManager.applySettings(settings);
    detectionNotifier.configure(settings);
  }

  const downloadController = createDownloadController({
    downloadFile: async (candidate, job) => {
      const probe = probeDirectMedia(candidate);
      const downloadId = await chrome.downloads.download({
        url: probe.url,
        filename: probe.fileName,
        saveAs: Boolean(job.selection.saveAs),
      });

      return {
        fileName: probe.fileName,
        mimeType: probe.mimeType,
        outputUrl: probe.url,
        downloadId,
      };
    },
    ...(typeof URL.createObjectURL === 'function'
      ? {
          downloadDirectWithRanges: async ({ candidate, job, signal }) => {
            const probe = probeDirectMedia(candidate);
            const bytes = await downloadDirectWithRanges({
              url: probe.url,
              signal,
            });
            const buffer = new ArrayBuffer(bytes.byteLength);
            new Uint8Array(buffer).set(bytes);
            const objectUrl = URL.createObjectURL(
              new Blob([buffer], { type: probe.mimeType }),
            );

            try {
              const downloadId = await chrome.downloads.download({
                url: objectUrl,
                filename: probe.fileName,
                saveAs: Boolean(job.selection.saveAs),
              });

              return {
                fileName: probe.fileName,
                mimeType: probe.mimeType,
                outputUrl: probe.url,
                downloadId,
                sizeBytes: bytes.byteLength,
                notes: ['Browser assembled direct download from HTTP byte ranges.'],
              };
            } finally {
              URL.revokeObjectURL?.(objectUrl);
            }
          },
        }
      : {}),
    runHls: async (input) => {
      const candidate = candidateRegistry
        .get(input.job.tabId)
        .find((item) => item.id === input.job.candidateId);

      if (!candidate) {
        throw new Error(`Candidate not found: ${input.job.candidateId}`);
      }

      const writeFile = await getDirectToDiskWriter();

      return runBrowserHlsExportJob({
        ...input,
        candidate,
        ...(writeFile ? { writeFile } : {}),
        onPlan: (plan) => initializeHlsSegmentStatuses(input.job.id, plan),
        onProgress: (event) => updateHlsSegmentProgress(input.job.id, event),
      });
    },
    runDash: async (input) => {
      const candidate = candidateRegistry
        .get(input.job.tabId)
        .find((item) => item.id === input.job.candidateId);

      if (!candidate) {
        throw new Error(`Candidate not found: ${input.job.candidateId}`);
      }

      const writeFile = await getDirectToDiskWriter();

      return runBrowserDashExportJob({
        ...input,
        candidate,
        ...(writeFile ? { writeFile } : {}),
      });
    },
    nativeExport: ({ candidate, job }) =>
      runNativeExportJob({
        candidate,
        job,
        nativeClient: getNativeClient(),
        jobStore,
        subtitleStore,
      }),
    browserDirectTrim: ({ candidate, job }) =>
      runBrowserDirectTrimJob({
        candidate,
        job,
        offscreenRecord: (message) => offscreenManager.sendMessage(message),
        download: chrome.downloads.download,
        createObjectUrl:
          typeof URL.createObjectURL === 'function'
            ? URL.createObjectURL.bind(URL)
            : undefined,
        revokeObjectUrl:
          typeof URL.revokeObjectURL === 'function'
            ? URL.revokeObjectURL.bind(URL)
            : undefined,
      }),
    enableNativeFeatures: false,
    cleanupAfterSave: (jobId) =>
      cleanupJobStorage(jobId, {
        indexedDb: fragmentStore,
        metadata: bucketMetadataStore,
        subtitles: subtitleStore,
      }).then((result) => {
        if (!result.ok) {
          throw new Error(result.errors.join('; '));
        }
      }),
  });
  const downloadQueue = createDownloadQueue({
    jobStore,
    executeJob: async (job) => {
      const candidate = candidateRegistry
        .get(job.tabId)
        .find((item) => item.id === job.candidateId);

      if (!candidate) {
        throw new Error(`Candidate not found: ${job.candidateId}`);
      }

      const completedJob = await downloadController.runManaged(candidate, job, {
        jobStore,
        historyStore,
      });

      if (!completedJob.output) {
        throw new Error('Download completed without output metadata.');
      }

      return completedJob.output;
    },
  });
  const notificationManager = createNotificationManager(chrome.runtime);
  const detectionNotifier = createDetectionNotifier({
    emit: ({ count, hostname }) => {
      void chrome.runtime
        .sendMessage({
          type: 'SHOW_WARNING',
          payload: {
            text: `${count} new ${count === 1 ? 'stream' : 'streams'} detected on ${hostname}`,
            warningType: 'info',
            autoHideMs: 4500,
          },
        })
        .catch(() => undefined);
    },
    setBadge: (text) => {
      chrome.action?.setBadgeText?.({ text }).catch?.(() => undefined);
    },
  });
  const runtimeRouter = createRuntimeRouter({
    candidateRegistry,
    tabSnapshots,
    jobStore,
    historyStore,
    downloadQueue,
    requestJournal,
    fetchManifest: async (url) => {
      const response = await fetch(url, { credentials: 'include' });

      if (!response.ok) {
        throw new Error(`Manifest request failed: ${response.status}`);
      }

      return response.text();
    },
    ensurePreviewClip: (candidate, options) =>
      ensurePreviewClip(candidate, {
        ...(settingsStore.get('enableNativeFeatures') ? { nativeClient: getNativeClient() } : {}),
        ...(settingsStore.get('enableBrowserFallbacks')
          ? { offscreenRecord: (message) => offscreenManager.sendMessage(message) }
          : {}),
        ...options,
      }),
    ensureThumbnail: (candidate) =>
      ensureNativeThumbnail(candidate, {
        ...(settingsStore.get('enableNativeFeatures') ? { nativeClient: getNativeClient() } : {}),
        ...(settingsStore.get('enableBrowserFallbacks')
          ? { offscreenCapture: (message) => offscreenManager.sendMessage(message) }
          : {}),
      }),
    cancelDownload: (jobId) => downloadController.abort(jobId, { jobStore }),
    recordDetection: (hostname, count) => detectionNotifier.recordDetection(hostname, count),
  });
  const autoScan = createAutoScanController({
    statusStore: tabVideoStatus,
    scanTab: async (tabId) => candidateRegistry.get(tabId),
    getSettings: () => ({ autoScanEnabled: settingsStore.get('autoScanEnabled') }),
    action: chrome.action,
  });
  const ingestContextCandidate = (candidate: MediaCandidate) => {
    candidateRegistry.set(candidate.tabId, [
      ...candidateRegistry.get(candidate.tabId),
      candidate,
    ]);
  };
  const contextMenuManager = createContextMenuManager({
    getSettings: () => ({ enableContextMenu: settingsStore.get('enableContextMenu') }),
    startDownload: (candidate) => {
      ingestContextCandidate(candidate);
      downloadQueue.enqueue(candidate, { mode: 'best' });
      void downloadQueue.drain();
    },
    ingestCandidate: ingestContextCandidate,
  });

  chrome.sidePanel.setPanelBehavior(getSidePanelBehavior());
  void settingsStore.load().then((settings) => {
    // Apply settings that require the store to be fully loaded first.
    applyLoadedSettings(settings);
    return contextMenuManager.register();
  });
  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[SETTINGS_STORAGE_KEY]) {
      return;
    }

    void settingsStore.load().then(applyLoadedSettings);
  });
  registerPassiveRequestJournal(requestJournal, undefined, headerContext);
  registerBackgroundCommandHandlers({
    commands: chrome.commands,
    sidePanel: chrome.sidePanel,
    windows: chrome.windows,
    tabs: chrome.tabs,
    jobStore,
    downloadQueue,
  });
  registerRuntimeRouter(runtimeRouter);
  chrome.tabs?.onRemoved?.addListener((tabId, removeInfo) => {
    autoScan.handleTabRemoved(tabId);
    const candidates = candidateRegistry.get(tabId);
    if (candidates.length > 0) {
      void saveDetectionsOnTabClose({
        tabId,
        incognito: Boolean(removeInfo?.isWindowClosing) ? false : false,
        candidates,
      });
    }
  });
  chrome.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      candidateRegistry.clear(tabId);
      requestJournal.clear(tabId);
      autoScan.handleTabNavigation(tabId);
    }
  });

  return {
    candidateRegistry,
    requestJournal,
    headerContext,
    tabSnapshots,
    tabVideoStatus,
    settingsStore,
    jobStore,
    historyStore,
    downloadQueue,
    downloadController,
    notificationManager,
    detectionNotifier,
    contextMenuManager,
    runtimeRouter,
    autoScan,
  };
}

export default defineBackground({
  type: 'module',
  main() {
    initializeBackgroundShell();
  },
});
