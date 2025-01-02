import { create } from 'zustand';
import type { DetectedMedia } from '@/src/types/media';
import type { PanelSurfaceState } from '@/src/types/ui-state';

export interface PanelStoreState {
  surfaceState: PanelSurfaceState;
  mediaItems: DetectedMedia[];
  downloadingIds: Set<string>;
  errorMessage: string | null;
  removeItem: (id: string) => void;
  setQuality: (id: string, quality: string) => void;
  downloadItem: (id: string) => void;
  setSurfaceState: (surfaceState: PanelSurfaceState) => void;
  setErrorMessage: (errorMessage: string | null) => void;
}

export const usePanelStore = create<PanelStoreState>((set) => ({
  surfaceState: 'detecting',
  mediaItems: [],
  downloadingIds: new Set<string>(),
  errorMessage: null,
  removeItem: (id) =>
    set((state) => {
      const mediaItems = state.mediaItems.filter((item) => item.id !== id);

      return {
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
