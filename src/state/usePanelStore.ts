import { create } from 'zustand';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import type { RuntimeClient } from '@/src/lib/runtime/client';
import { toDetectedMedia } from '@/src/shared/adapters/media-card';
import type { DetectedMedia } from '@/src/types/media';
import type { PanelSurfaceState } from '@/src/types/ui-state';

export interface PanelStoreState {
  surfaceState: PanelSurfaceState;
  candidates: MediaCandidate[];
  mediaItems: DetectedMedia[];
  downloadingIds: Set<string>;
  errorMessage: string | null;
  loadCandidates: (runtimeClient: RuntimeClient, tabId: number) => Promise<void>;
  setCandidates: (candidates: MediaCandidate[]) => void;
  removeItem: (id: string) => void;
  setQuality: (id: string, quality: string) => void;
  downloadItem: (id: string) => void;
  setSurfaceState: (surfaceState: PanelSurfaceState) => void;
  setErrorMessage: (errorMessage: string | null) => void;
}

export const usePanelStore = create<PanelStoreState>((set) => ({
  surfaceState: 'detecting',
  candidates: [],
  mediaItems: [],
  downloadingIds: new Set<string>(),
  errorMessage: null,
  loadCandidates: async (runtimeClient, tabId) => {
    set({ surfaceState: 'detecting', errorMessage: null });

    try {
      const candidates = await runtimeClient.getCandidates(tabId);

      set({
        candidates,
        mediaItems: candidates.map(toDetectedMedia),
        surfaceState: candidates.length > 0 ? 'results' : 'empty',
      });
    } catch (error) {
      set({
        candidates: [],
        mediaItems: [],
        surfaceState: 'error',
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Something went wrong while inspecting this page',
      });
    }
  },
  setCandidates: (candidates) =>
    set({
      candidates,
      mediaItems: candidates.map(toDetectedMedia),
      surfaceState: candidates.length > 0 ? 'results' : 'empty',
    }),
  removeItem: (id) =>
    set((state) => {
      const mediaItems = state.mediaItems.filter((item) => item.id !== id);
      const candidates = state.candidates.filter((candidate) => candidate.id !== id);

      return {
        candidates,
        mediaItems,
        surfaceState: mediaItems.length === 0 ? 'empty' : 'results',
      };
    }),
  setQuality: (id, quality) =>
    set((state) => ({
      mediaItems: state.mediaItems.map((item) =>
        item.id === id ? { ...item, selectedQuality: quality } : item,
      ),
    })),
  downloadItem: (id) =>
    set((state) => ({
      downloadingIds: new Set([...state.downloadingIds, id]),
    })),
  setSurfaceState: (surfaceState) => set({ surfaceState }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
}));
