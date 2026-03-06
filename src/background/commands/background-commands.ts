import type { DownloadPhase } from '@/video_downloader_types_skeleton';
import type { DownloadQueue } from '@/src/background/jobs/download-queue';
import type { JobStore } from '@/src/background/jobs/job-store';

interface CommandEventLike {
  addListener(callback: (command: string) => void): void;
}

export interface CommandHostLike {
  onCommand?: CommandEventLike;
}

type SidePanelOpenInput =
  | { windowId: number; tabId?: number }
  | { tabId: number; windowId?: number };

interface SidePanelLike {
  open?: (options: SidePanelOpenInput) => Promise<void> | void;
}

interface WindowLike {
  id?: number;
}

interface WindowsLike {
  getCurrent?: () => Promise<WindowLike>;
}

interface TabLike {
  id?: number;
}

interface TabsLike {
  query?: (queryInfo: { active: boolean; currentWindow: boolean }) => Promise<TabLike[]>;
}

export interface BackgroundCommandDependencies {
  commands?: CommandHostLike;
  sidePanel?: SidePanelLike;
  windows?: WindowsLike;
  tabs?: TabsLike;
  jobStore: JobStore;
  downloadQueue: DownloadQueue;
}

const pausablePhases = new Set<DownloadPhase>([
  'queued',
  'preparing',
  'fetching',
  'decrypting',
  'transmuxing',
  'assembling',
  'finalizing',
  'exporting',
]);

export function pauseAllDownloadJobs(jobStore: JobStore): string[] {
  const pausedIds: string[] = [];

  for (const job of jobStore.list()) {
    if (!pausablePhases.has(job.phase)) {
      continue;
    }

    jobStore.update(job.id, { phase: 'paused' });
    pausedIds.push(job.id);
  }

  return pausedIds;
}

async function openSidePanel(dependencies: BackgroundCommandDependencies): Promise<void> {
  const open = dependencies.sidePanel?.open;

  if (!open) {
    return;
  }

  const currentWindow = await dependencies.windows?.getCurrent?.();
  if (currentWindow?.id !== undefined) {
    await open({ windowId: currentWindow.id });
    return;
  }

  const [tab] = await dependencies.tabs?.query?.({
    active: true,
    currentWindow: true,
  }) ?? [];
  if (tab?.id !== undefined) {
    await open({ tabId: tab.id });
  }
}

export function registerBackgroundCommandHandlers(
  dependencies: BackgroundCommandDependencies,
): void {
  dependencies.commands?.onCommand?.addListener((command) => {
    switch (command) {
      case 'pause-all':
        pauseAllDownloadJobs(dependencies.jobStore);
        break;
      case 'clear-completed':
        dependencies.downloadQueue.clearCompleted();
        break;
      case 'open-side-panel':
        void openSidePanel(dependencies);
        break;
    }
  });
}
