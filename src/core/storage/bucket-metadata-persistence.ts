import type { BucketMetadataPersistence } from './bucket-metadata-store';

const KEY_PREFIX = 'unshackle:bucketMeta:';

export interface LocalStorageArea {
  get(keys: null): Promise<Record<string, unknown>>;
  set(items: Record<string, string>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

function resolveArea(area?: LocalStorageArea): LocalStorageArea | undefined {
  if (area) {
    return area;
  }

  const local = globalThis.chrome?.storage?.local as LocalStorageArea | undefined;
  return local;
}

// Persists serialized bucket metadata to chrome.storage.local under a per-bucket
// key so concurrent writes for different buckets do not race on a shared blob.
export function createChromeBucketMetadataPersistence(
  area?: LocalStorageArea,
): BucketMetadataPersistence {
  return {
    async loadAll() {
      const storage = resolveArea(area);
      if (!storage) {
        return {};
      }

      const all = await storage.get(null);
      const result: Record<string, string> = {};

      for (const [key, value] of Object.entries(all)) {
        if (key.startsWith(KEY_PREFIX) && typeof value === 'string') {
          result[key.slice(KEY_PREFIX.length)] = value;
        }
      }

      return result;
    },

    async save(bucketId, serialized) {
      const storage = resolveArea(area);
      await storage?.set({ [`${KEY_PREFIX}${bucketId}`]: serialized });
    },

    async remove(bucketId) {
      const storage = resolveArea(area);
      await storage?.remove(`${KEY_PREFIX}${bucketId}`);
    },
  };
}
