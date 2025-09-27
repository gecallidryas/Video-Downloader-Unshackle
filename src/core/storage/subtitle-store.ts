import type { SubtitleFormat } from '@/src/core/naming/subtitle-filename';

export interface SubtitleEntry {
  jobId: string;
  trackId: string;
  language?: string;
  format: SubtitleFormat;
  content: string;
}

export interface SubtitleStore {
  put(entry: SubtitleEntry): Promise<void>;
  listByJob(jobId: string): Promise<SubtitleEntry[]>;
  deleteJob(jobId: string): Promise<void>;
  estimateBytes(): Promise<number>;
}

function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }

  return value.length;
}

export function createInMemorySubtitleStore(): SubtitleStore {
  const entries = new Map<string, SubtitleEntry>();

  function key(jobId: string, trackId: string): string {
    return `${jobId}::${trackId}`;
  }

  return {
    async put(entry) {
      entries.set(key(entry.jobId, entry.trackId), { ...entry });
    },

    async listByJob(jobId) {
      return Array.from(entries.values()).filter((entry) => entry.jobId === jobId);
    },

    async deleteJob(jobId) {
      for (const k of Array.from(entries.keys())) {
        if (k.startsWith(`${jobId}::`)) {
          entries.delete(k);
        }
      }
    },

    async estimateBytes() {
      let total = 0;
      for (const entry of entries.values()) {
        total += byteLength(entry.content);
      }
      return total;
    },
  };
}
