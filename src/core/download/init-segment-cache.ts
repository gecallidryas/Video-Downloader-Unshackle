export interface InitSegmentCacheKey {
  uri: string;
  byteRange?: { start: number; end: number };
}

export interface InitSegmentCache {
  getOrFetch(
    key: InitSegmentCacheKey,
    fetcher: () => Promise<Uint8Array>,
  ): Promise<Uint8Array>;
}

function cacheKey(key: InitSegmentCacheKey): string {
  const range = key.byteRange ? `${key.byteRange.start}-${key.byteRange.end}` : 'full';

  return `${key.uri}#${range}`;
}

export function createInitSegmentCache(): InitSegmentCache {
  const entries = new Map<string, Promise<Uint8Array>>();

  return {
    getOrFetch(key, fetcher) {
      const id = cacheKey(key);
      const existing = entries.get(id);

      if (existing) {
        return existing;
      }

      const pending = fetcher().catch((error: unknown) => {
        entries.delete(id);
        throw error;
      });
      entries.set(id, pending);

      return pending;
    },
  };
}
