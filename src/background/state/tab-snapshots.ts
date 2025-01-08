import type { ActiveTabSnapshot } from '@/video_downloader_types_skeleton';
import type { CandidateRegistry } from '../candidates/candidate-registry';

export interface TabCandidateSnapshot {
  tab?: ActiveTabSnapshot;
  candidates: ReturnType<CandidateRegistry['get']>;
}

export interface TabSnapshotStore {
  set(snapshot: ActiveTabSnapshot): ActiveTabSnapshot;
  get(tabId: number): ActiveTabSnapshot | undefined;
  getCandidateSnapshot(
    tabId: number,
    candidateRegistry: CandidateRegistry,
  ): TabCandidateSnapshot;
  clear(tabId: number): void;
}

export function createTabSnapshotStore(): TabSnapshotStore {
  const snapshots = new Map<number, ActiveTabSnapshot>();

  return {
    set(snapshot) {
      snapshots.set(snapshot.tabId, { ...snapshot });

      return { ...snapshot };
    },

    get(tabId) {
      const snapshot = snapshots.get(tabId);

      return snapshot ? { ...snapshot } : undefined;
    },

    getCandidateSnapshot(tabId, candidateRegistry) {
      return {
        tab: snapshots.get(tabId),
        candidates: candidateRegistry.get(tabId),
      };
    },

    clear(tabId) {
      snapshots.delete(tabId);
    },
  };
}
