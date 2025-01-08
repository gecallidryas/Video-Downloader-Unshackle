import { create } from 'zustand';
import type { HistoryRecord } from '@/video_downloader_types_skeleton';
import type { DownloadHistoryRecord } from '@/src/background/jobs/history-store';

export interface HistoryStoreState {
  records: DownloadHistoryRecord[];
  setRecords: (records: HistoryRecord[]) => void;
  upsertRecord: (record: HistoryRecord) => void;
  clearAll: () => void;
  removeRecord: (id: string) => void;
}

export const useHistoryStore = create<HistoryStoreState>((set) => ({
  records: [],
  setRecords: (records) => set({ records: records.map((record) => ({ ...record })) }),
  upsertRecord: (record) =>
    set((state) => {
      const records = state.records.filter((item) => item.id !== record.id);

      return { records: [...records, { ...record }] };
    }),
  clearAll: () => set({ records: [] }),
  removeRecord: (id) =>
    set((s) => ({ records: s.records.filter((r) => r.id !== id) })),
}));
