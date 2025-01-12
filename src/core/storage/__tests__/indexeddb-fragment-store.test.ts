import { describe, expect, test } from 'vitest';
import { createIndexedDbFragmentStore } from '../indexeddb-fragment-store';

describe('indexeddb fragment store', () => {
  test('creates buckets, writes fragments, reads fragments, lists indices, and deletes buckets', async () => {
    const store = createIndexedDbFragmentStore({ mode: 'memory' });

    await store.createBucket('job-1');
    await store.writeFragment('job-1', 2, new Uint8Array([2, 3]));
    await store.writeFragment('job-1', 0, new Uint8Array([0, 1]));

    await expect(store.readFragment('job-1', 2)).resolves.toEqual(new Uint8Array([2, 3]));
    await expect(store.listFragmentIndices('job-1')).resolves.toEqual([0, 2]);
    await expect(store.readAllFragments('job-1')).resolves.toEqual([
      new Uint8Array([0, 1]),
      new Uint8Array([2, 3]),
    ]);

    await store.deleteBucket('job-1');
    await expect(store.readFragment('job-1', 0)).rejects.toThrow('Bucket job-1 not found.');
  });

  test('cleans orphaned buckets while keeping active job buckets', async () => {
    const store = createIndexedDbFragmentStore({ mode: 'memory' });

    await store.createBucket('active');
    await store.createBucket('orphan-a');
    await store.createBucket('orphan-b');

    await expect(store.cleanupOrphanedBuckets(new Set(['active']))).resolves.toBe(2);
    await expect(store.listFragmentIndices('active')).resolves.toEqual([]);
    await expect(store.listFragmentIndices('orphan-a')).rejects.toThrow('Bucket orphan-a not found.');
  });
});
