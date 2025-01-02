import { create } from 'zustand';
import type { HistoryRecord } from '@/video_downloader_types_skeleton';

export interface HistoryStoreState {
  records: HistoryRecord[];
  clearAll: () => void;
  removeRecord: (id: string) => void;
}

export const useHistoryStore = create<HistoryStoreState>((set) => ({
  records: [],
  clearAll: () => set({ records: [] }),
  removeRecord: (id) =>
    set((s) => ({ records: s.records.filter((r) => r.id !== id) })),
}));
