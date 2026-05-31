import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  mergeCandidateEvidence,
  type MergeCandidateEvidenceInput,
} from '@/src/core/candidates/merge-candidate-evidence';
import {
  createDebouncedWriter,
  type StatePersistence,
} from '@/src/background/state/state-persistence';

export interface CandidateRegistry {
  set(tabId: number, candidates: MediaCandidate[]): MediaCandidate[];
  setFromEvidence(input: MergeCandidateEvidenceInput): MediaCandidate[];
  get(tabId: number): MediaCandidate[];
  tabIds(): number[];
  all(): MediaCandidate[];
  findById(candidateId: string): MediaCandidate | undefined;
  setDuration(candidateId: string, durationSec: number): MediaCandidate | undefined;
  clear(tabId: number): void;
  rehydrate(): Promise<void>;
  flush(): Promise<void>;
}

export interface CandidateRegistryOptions {
  persistence?: StatePersistence;
  persistKey?: string;
  debounceMs?: number;
  onChange?: () => void;
}

type CandidateSnapshot = Array<[number, MediaCandidate[]]>;

export function dedupeCandidatesById(
  candidates: MediaCandidate[],
): MediaCandidate[] {
  return Array.from(
    new Map(candidates.map((candidate) => [candidate.id, candidate])).values(),
  );
}

export function createCandidateRegistry(
  options: CandidateRegistryOptions = {},
): CandidateRegistry {
  const candidatesByTabId = new Map<number, MediaCandidate[]>();

  const persistKey = options.persistKey ?? 'candidates';
  const writer = options.persistence
    ? createDebouncedWriter(async () => {
        const snapshot: CandidateSnapshot = Array.from(
          candidatesByTabId.entries(),
        );
        await options.persistence?.write(persistKey, snapshot);
      }, options.debounceMs ?? 250)
    : undefined;

  function persist(): void {
    writer?.schedule();
    options.onChange?.();
  }

  return {
    set(tabId, candidates) {
      const snapshot = dedupeCandidatesById(
        candidates.map((candidate) => ({ ...candidate, tabId })),
      );
      candidatesByTabId.set(tabId, snapshot);
      persist();

      return [...snapshot];
    },

    setFromEvidence(input) {
      return this.set(input.tabId, mergeCandidateEvidence(input));
    },

    get(tabId) {
      return [...(candidatesByTabId.get(tabId) ?? [])];
    },

    tabIds() {
      return Array.from(candidatesByTabId.keys());
    },

    all() {
      return Array.from(candidatesByTabId.values()).flatMap((items) => [...items]);
    },

    findById(candidateId) {
      for (const candidates of candidatesByTabId.values()) {
        const candidate = candidates.find((item) => item.id === candidateId);

        if (candidate) {
          return candidate;
        }
      }

      return undefined;
    },

    setDuration(candidateId, durationSec) {
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        return undefined;
      }

      for (const [tabId, candidates] of candidatesByTabId.entries()) {
        const index = candidates.findIndex((item) => item.id === candidateId);
        if (index === -1) {
          continue;
        }

        const existing = candidates[index];
        if (existing.durationSec === durationSec) {
          return existing;
        }

        const updated: MediaCandidate = {
          ...existing,
          durationSec,
          updatedAt: Date.now(),
        };
        const next = [...candidates];
        next[index] = updated;
        candidatesByTabId.set(tabId, next);
        persist();
        return updated;
      }

      return undefined;
    },

    clear(tabId) {
      if (candidatesByTabId.delete(tabId)) {
        persist();
      }
    },

    async rehydrate() {
      const snapshot = await options.persistence?.read<CandidateSnapshot>(
        persistKey,
      );
      if (!snapshot) {
        return;
      }

      candidatesByTabId.clear();
      for (const [tabId, candidates] of snapshot) {
        candidatesByTabId.set(tabId, candidates);
      }
    },

    async flush() {
      await writer?.flushNow();
    },
  };
}
