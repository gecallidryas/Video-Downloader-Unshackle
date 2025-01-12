export interface JobBucketStore {
  deleteBucket(jobId: string): Promise<void>;
}

export interface CleanupJobStorageOptions {
  indexedDb?: JobBucketStore;
  opfs?: JobBucketStore;
}

export interface CleanupJobStorageResult {
  ok: boolean;
  errors: string[];
}

export async function cleanupJobStorage(
  jobId: string,
  options: CleanupJobStorageOptions,
): Promise<CleanupJobStorageResult> {
  const errors: string[] = [];
  const bucketIds = [jobId, `${jobId}_audio`, `${jobId}_subs`];

  for (const store of [options.indexedDb, options.opfs]) {
    if (!store) {
      continue;
    }

    for (const bucketId of bucketIds) {
      try {
        await store.deleteBucket(bucketId);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
