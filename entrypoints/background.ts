import { defineBackground } from 'wxt/utils/define-background';
import { createCandidateRegistry } from '@/src/background/candidates/candidate-registry';
import { createContextMenuManager } from '@/src/background/context-menu/context-menu';
import { createDownloadController } from '@/src/background/jobs/download-controller';
import { createDownloadQueue } from '@/src/background/jobs/download-queue';
import { createHistoryStore } from '@/src/background/jobs/history-store';
import { createJobStore } from '@/src/background/jobs/job-store';
import { createNotificationManager } from '@/src/background/notifications/notification-manager';
import { createSettingsStore } from '@/src/background/settings/settings-store';
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
    runHls: async () => ({
      fileName: 'hls-output.mp4',
      mimeType: 'video/mp4',
    }),
    runDash: async () => ({
      fileName: 'dash-output.mp4',
      mimeType: 'video/mp4',
    }),
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
        offscreenRecord: (message) => chrome.runtime.sendMessage(message),
        ...options,
      }),
    ensureThumbnail: (candidate) =>
      ensureNativeThumbnail(candidate, {
        nativeClient,
        offscreenCapture: (message) => chrome.runtime.sendMessage(message),
      }),
  });
  const autoScan = createAutoScanController({
    statusStore: tabVideoStatus,
    scanTab: async (tabId) => candidateRegistry.get(tabId),
    getSettings: () => ({ autoScanEnabled: settingsStore.get('autoScanEnabled') }),
    action: chrome.action,
  });
  const notificationManager = createNotificationManager(chrome.runtime);
  const contextMenuManager = createContextMenuManager({
    getSettings: () => ({ enableContextMenu: settingsStore.get('enableContextMenu') }),
    startDownload: (candidate) => {
      candidateRegistry.set(candidate.tabId, [
        ...candidateRegistry.get(candidate.tabId),
        candidate,
      ]);
      downloadQueue.enqueue(candidate, { mode: 'best' });
      void downloadQueue.drain();
    },
  });

  chrome.sidePanel.setPanelBehavior(getSidePanelBehavior());
  void settingsStore.load().then((settings) => {
    // Apply settings that require the store to be fully loaded first.
    headerContext.updateOptions({
      captureCredentialHeaders: settings.advancedMode && settings.captureCredentialHeaders,
    });
    downloadController.updateSettings({
      suppressProtectedDownloads: settings.suppressProtectedDownloads,
    });
    notificationManager.applySettings(settings);
    return contextMenuManager.register();
  });
  registerPassiveRequestJournal(requestJournal, undefined, headerContext);
  registerRuntimeRouter(runtimeRouter);
  chrome.tabs?.onRemoved?.addListener((tabId) => autoScan.handleTabRemoved(tabId));
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
