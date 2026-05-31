import { describe, expect, test } from 'vitest';
import {
  createBucketMetadataStore,
  type BucketMetadataPersistence,
} from '../bucket-metadata-store';

describe('bucket metadata store', () => {
  test('tracks bytes written, chunk count, subtitle bytes, and rehydrates after reload', async () => {
    const persisted = new Map<string, string>();
    const store = createBucketMetadataStore({ persisted });

    await store.recordChunk('job-1', 0, 10);
    await store.recordChunk('job-1', 1, 15);
    await store.recordSubtitleBytes('job-1', 5);

    expect(await store.get('job-1')).toMatchObject({
      bucketId: 'job-1',
      bytesWritten: 25,
      chunkCount: 2,
      subtitleBytes: 5,
    });

    const rehydrated = createBucketMetadataStore({ persisted });
    expect(await rehydrated.get('job-1')).toMatchObject({
      bytesWritten: 25,
      chunkCount: 2,
      subtitleBytes: 5,
    });
  });

  test('serializes concurrent metadata updates per bucket', async () => {
    const store = createBucketMetadataStore();

    await Promise.all(
      Array.from({ length: 25 }, (_, index) => store.recordChunk('job-2', index, 4)),
    );

    expect(await store.get('job-2')).toMatchObject({
      bytesWritten: 100,
      chunkCount: 25,
    });
  });

  test('writes through to durable persistence and removes on delete', async () => {
    const backing = new Map<string, string>();
    const persistence: BucketMetadataPersistence = {
      loadAll: async () => Object.fromEntries(backing),
      save: async (bucketId, serialized) => {
        backing.set(bucketId, serialized);
      },
      remove: async (bucketId) => {
        backing.delete(bucketId);
      },
    };
    const store = createBucketMetadataStore({ persistence });

    await store.recordChunk('job-3', 0, 8);
    expect(backing.has('job-3')).toBe(true);

    await store.delete('job-3');
    expect(backing.has('job-3')).toBe(false);
  });

  test('rehydrate restores metadata from durable persistence after a restart', async () => {
    const backing = new Map<string, string>();
    const persistence: BucketMetadataPersistence = {
      loadAll: async () => Object.fromEntries(backing),
      save: async (bucketId, serialized) => {
        backing.set(bucketId, serialized);
      },
      remove: async (bucketId) => {
        backing.delete(bucketId);
      },
    };

    const before = createBucketMetadataStore({ persistence });
    await before.recordChunk('job-4', 0, 20);
    await before.recordChunk('job-4', 1, 30);

    // Simulate a fresh service worker: a brand-new store backed by the same disk.
    const after = createBucketMetadataStore({ persistence });
    await after.rehydrate();

    expect(await after.get('job-4')).toMatchObject({
      bytesWritten: 50,
      chunkCount: 2,
    });
  });

  test('list returns metadata for every known bucket', async () => {
    const store = createBucketMetadataStore();
    await store.recordChunk('a', 0, 1);
    await store.recordChunk('b', 0, 2);

    const all = await store.list();
    expect(all.map((entry) => entry.bucketId).sort()).toEqual(['a', 'b']);
  });
});
