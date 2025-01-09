import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import type { TabVideoStatusStore } from '../state/tab-video-status';

export interface AutoScanSettings {
  autoScanEnabled: boolean;
}

export interface ActionBadgeLike {
  setBadgeText(input: { tabId: number; text: string }): void | Promise<void>;
  setTitle?(input: { tabId: number; title: string }): void | Promise<void>;
}

export interface AutoScanControllerOptions {
  statusStore: TabVideoStatusStore;
  scanTab(tabId: number): Promise<Array<Pick<MediaCandidate, 'id'>>>;
  getSettings(): AutoScanSettings;
  action?: ActionBadgeLike;
}

export interface AutoScanController {
  handleTabActivated(tabId: number): Promise<void>;
  handleTabRemoved(tabId: number): void;
  handleTabNavigation(tabId: number): void;
  updateActionForTab(tabId: number): Promise<void>;
}

export function createAutoScanController(
  options: AutoScanControllerOptions,
): AutoScanController {
  async function updateActionForTab(tabId: number): Promise<void> {
    const count = options.statusStore.get(tabId)?.candidateCount ?? 0;

    await options.action?.setBadgeText({
      tabId,
      text: count > 0 ? String(count) : '',
    });
    await options.action?.setTitle?.({
      tabId,
      title:
        count > 0
          ? `${count} media candidate${count === 1 ? '' : 's'} detected`
          : 'No media candidates detected',
    });
  }

  return {
    async handleTabActivated(tabId) {
      if (!options.getSettings().autoScanEnabled) {
        await updateActionForTab(tabId);
        return;
      }

      const candidates = await options.scanTab(tabId);

      options.statusStore.setCandidateCount(tabId, candidates.length);
      await updateActionForTab(tabId);
    },

    handleTabRemoved(tabId) {
      options.statusStore.clear(tabId);
    },

    handleTabNavigation(tabId) {
      options.statusStore.setCandidateCount(tabId, 0);
      void updateActionForTab(tabId);
    },

    updateActionForTab,
  };
}
