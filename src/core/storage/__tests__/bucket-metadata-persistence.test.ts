import { describe, expect, test } from 'vitest';
import {
  createChromeBucketMetadataPersistence,
  type LocalStorageArea,
} from '../bucket-metadata-persistence';

function createFakeArea(): LocalStorageArea & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    async get() {
      return Object.fromEntries(store);
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value);
      }
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        store.delete(key);
      }
    },
  };
}

describe('chrome bucket metadata persistence', () => {
  test('saves under a prefixed per-bucket key and loads only those keys', async () => {
    const area = createFakeArea();
    area.store.set('unrelated:key', 'ignored');
    const persistence = createChromeBucketMetadataPersistence(area);

    await persistence.save('job-1', '{"bytesWritten":10}');
    await persistence.save('job-2', '{"bytesWritten":20}');

    expect(area.store.get('unshackle:bucketMeta:job-1')).toBe('{"bytesWritten":10}');

    await expect(persistence.loadAll()).resolves.toEqual({
      'job-1': '{"bytesWritten":10}',
      'job-2': '{"bytesWritten":20}',
    });
  });

  test('removes a single bucket key', async () => {
    const area = createFakeArea();
    const persistence = createChromeBucketMetadataPersistence(area);

    await persistence.save('job-1', '{}');
    await persistence.remove('job-1');

    await expect(persistence.loadAll()).resolves.toEqual({});
  });

  test('degrades to a no-op when no storage area is available', async () => {
    const globalWithChrome = globalThis as { chrome?: unknown };
    const original = globalWithChrome.chrome;
    globalWithChrome.chrome = undefined;

    try {
      const persistence = createChromeBucketMetadataPersistence();

      await expect(persistence.save('job-1', '{}')).resolves.toBeUndefined();
      await expect(persistence.loadAll()).resolves.toEqual({});
    } finally {
      globalWithChrome.chrome = original;
    }
  });
});
