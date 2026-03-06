import { describe, expect, test } from 'vitest';
import { createBucketMetadataStore } from '../bucket-metadata-store';

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
});
