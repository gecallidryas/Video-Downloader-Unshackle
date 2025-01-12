import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  mergeCandidateEvidence,
  type MergeCandidateEvidenceInput,
} from '@/src/core/candidates/merge-candidate-evidence';

export interface CandidateRegistry {
  set(tabId: number, candidates: MediaCandidate[]): MediaCandidate[];
  setFromEvidence(input: MergeCandidateEvidenceInput): MediaCandidate[];
  get(tabId: number): MediaCandidate[];
  findById(candidateId: string): MediaCandidate | undefined;
  clear(tabId: number): void;
}

export function dedupeCandidatesById(
  candidates: MediaCandidate[],
): MediaCandidate[] {
  return Array.from(
    new Map(candidates.map((candidate) => [candidate.id, candidate])).values(),
  );
}

export function createCandidateRegistry(): CandidateRegistry {
  const candidatesByTabId = new Map<number, MediaCandidate[]>();

  return {
    set(tabId, candidates) {
      const snapshot = dedupeCandidatesById(candidates);
      candidatesByTabId.set(tabId, snapshot);

      return [...snapshot];
    },

    setFromEvidence(input) {
      return this.set(input.tabId, mergeCandidateEvidence(input));
    },

    get(tabId) {
      return [...(candidatesByTabId.get(tabId) ?? [])];
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

    clear(tabId) {
      candidatesByTabId.delete(tabId);
    },
  };
}
