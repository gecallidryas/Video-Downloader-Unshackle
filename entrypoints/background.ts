import { defineBackground } from 'wxt/utils/define-background';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { createCandidateRegistry } from '@/src/background/candidates/candidate-registry';
import { createContextMenuManager } from '@/src/background/context-menu/context-menu';
import { createDownloadController } from '@/src/background/jobs/download-controller';
import { createDownloadQueue } from '@/src/background/jobs/download-queue';
import { createHistoryStore } from '@/src/background/jobs/history-store';
import { createJobStore } from '@/src/background/jobs/job-store';
import { createOffscreenManager } from '@/src/background/offscreen/offscreen-manager';
import { createNotificationManager } from '@/src/background/notifications/notification-manager';
import { createDetectionNotifier } from '@/src/background/notifications/detection-notifier';
import { saveDetectionsOnTabClose } from '@/src/background/state/previous-detections';
import { createSettingsStore } from '@/src/background/settings/settings-store';
import { runBrowserDashExportJob } from '@/src/background/jobs/browser-dash-runner';
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
import { createAutoScanController } from '@/src/background/scanning/auto-scan';
import { createTabSnapshotStore } from '@/src/background/state/tab-snapshots';
import { createTabVideoStatusStore } from '@/src/background/state/tab-video-status';
import { getSidePanelBehavior } from '@/src/lib/chrome/sidePanel';
import { probeDirectMedia } from '@/src/core/direct/probe-direct-media';
import { createNativeFfmpegClient } from '@/src/native/native-ffmpeg-client';
import { ensurePreviewClip } from '@/src/core/preview/native-preview-service';
import { ensureNativeThumbnail } from '@/src/core/thumbs/native-thumbnail-service';

export function initializeBackgroundShell() {
  const candidateRegistry = createCandidateRegistry();
  const requestJournal = createRequestJournal();
  const headerContext = createHeaderContextStore();
  const settingsStore = createSettingsStore();
  const jobStore = createJobStore();
  const historyStore = createHistoryStore();
  const tabSnapshots = createTabSnapshotStore();
  const tabVideoStatus = createTabVideoStatusStore();
  const nativeClient = createNativeFfmpegClient();
  const offscreenManager = createOffscreenManager();
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
    runHls: (input) => {
      const candidate = candidateRegistry
        .get(input.job.tabId)
        .find((item) => item.id === input.job.candidateId);

      if (!candidate) {
        throw new Error(`Candidate not found: ${input.job.candidateId}`);
      }

      return runBrowserHlsExportJob({
        ...input,
        candidate,
      });
    },
    runDash: (input) => {
      const candidate = candidateRegistry
        .get(input.job.tabId)
        .find((item) => item.id === input.job.candidateId);

      if (!candidate) {
        throw new Error(`Candidate not found: ${input.job.candidateId}`);
      }

      return runBrowserDashExportJob({
        ...input,
        candidate,
      });
    },
    nativeExport: ({ candidate, job }) =>
      runNativeExportJob({
        candidate,
        job,
        nativeClient,
        jobStore,
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
        nativeClient,
        offscreenRecord: (message) => offscreenManager.sendMessage(message),
        ...options,
      }),
    ensureThumbnail: (candidate) =>
      ensureNativeThumbnail(candidate, {
        nativeClient,
        offscreenCapture: (message) => offscreenManager.sendMessage(message),
      }),
  });
  const autoScan = createAutoScanController({
    statusStore: tabVideoStatus,
    scanTab: async (tabId) => candidateRegistry.get(tabId),
    getSettings: () => ({ autoScanEnabled: settingsStore.get('autoScanEnabled') }),
    action: chrome.action,
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
    headerContext.updateOptions({
      captureCredentialHeaders: settings.advancedMode && settings.captureCredentialHeaders,
    });
    downloadController.updateSettings({
      suppressProtectedDownloads: settings.suppressProtectedDownloads,
      defaultOutputFormat: settings.defaultOutputFormat,
      defaultQualityPolicy: settings.defaultQualityPolicy,
      maxConcurrentSegments: settings.maxConcurrentSegments,
      maxConcurrentSegmentsPerHost: settings.maxConcurrentSegmentsPerHost,
      segmentTimeoutMs: settings.segmentTimeoutMs,
    });
    notificationManager.applySettings(settings);
    detectionNotifier.configure(settings);
    return contextMenuManager.register();
  });
  registerPassiveRequestJournal(requestJournal, undefined, headerContext);
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
