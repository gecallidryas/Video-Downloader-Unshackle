export interface TabVideoStatus {
  tabId: number;
  candidateCount: number;
  updatedAt: number;
}

export interface TabVideoStatusStore {
  setCandidateCount(tabId: number, candidateCount: number): TabVideoStatus;
  get(tabId: number): TabVideoStatus | undefined;
  clear(tabId: number): void;
}

function cloneStatus(status: TabVideoStatus | undefined): TabVideoStatus | undefined {
  return status ? { ...status } : undefined;
}

export function createTabVideoStatusStore(
  now: () => number = () => Date.now(),
): TabVideoStatusStore {
  const statuses = new Map<number, TabVideoStatus>();

  return {
    setCandidateCount(tabId, candidateCount) {
      const status = {
        tabId,
        candidateCount,
        updatedAt: now(),
      };

      statuses.set(tabId, status);

      return { ...status };
    },

    get(tabId) {
      return cloneStatus(statuses.get(tabId));
    },

    clear(tabId) {
      statuses.delete(tabId);
    },
  };
}
