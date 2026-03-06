export interface BucketMetadata {
  bucketId: string;
  bytesWritten: number;
  chunkCount: number;
  subtitleBytes: number;
  updatedAt: number;
}

export interface BucketMetadataStoreOptions {
  persisted?: Map<string, string>;
  now?: () => number;
}

export interface BucketMetadataStore {
  get(bucketId: string): Promise<BucketMetadata | undefined>;
  recordChunk(bucketId: string, chunkIndex: number, bytesWritten: number): Promise<BucketMetadata>;
  recordSubtitleBytes(bucketId: string, subtitleBytes: number): Promise<BucketMetadata>;
  delete(bucketId: string): Promise<void>;
}

interface BucketState {
  metadata: BucketMetadata;
  chunkIndices: Set<number>;
}

function emptyMetadata(bucketId: string, now: number): BucketMetadata {
  return {
    bucketId,
    bytesWritten: 0,
    chunkCount: 0,
    subtitleBytes: 0,
    updatedAt: now,
  };
}

function cloneMetadata(metadata: BucketMetadata): BucketMetadata {
  return { ...metadata };
}

export function createBucketMetadataStore(
  options: BucketMetadataStoreOptions = {},
): BucketMetadataStore {
  const persisted = options.persisted ?? new Map<string, string>();
  const now = options.now ?? Date.now;
  const buckets = new Map<string, BucketState>();
  const queues = new Map<string, Promise<unknown>>();

  function load(bucketId: string): BucketState {
    const existing = buckets.get(bucketId);
    if (existing) {
      return existing;
    }

    const raw = persisted.get(bucketId);
    const metadata = raw
      ? ({ ...emptyMetadata(bucketId, now()), ...JSON.parse(raw), bucketId } as BucketMetadata)
      : emptyMetadata(bucketId, now());
    const state: BucketState = {
      metadata,
      chunkIndices: new Set(Array.from({ length: metadata.chunkCount }, (_, index) => index)),
    };
    buckets.set(bucketId, state);
    return state;
  }

  async function serialize<T>(bucketId: string, task: () => Promise<T>): Promise<T> {
    const previous = queues.get(bucketId) ?? Promise.resolve();
    const next = previous.then(task, task);
    queues.set(bucketId, next.catch(() => undefined));
    return next;
  }

  function persist(state: BucketState): void {
    persisted.set(state.metadata.bucketId, JSON.stringify(state.metadata));
  }

  return {
    async get(bucketId) {
      const raw = persisted.get(bucketId);
      if (!raw && !buckets.has(bucketId)) {
        return undefined;
      }

      return cloneMetadata(load(bucketId).metadata);
    },

    recordChunk(bucketId, chunkIndex, bytesWritten) {
      return serialize(bucketId, async () => {
        const state = load(bucketId);
        const isNewChunk = !state.chunkIndices.has(chunkIndex);
        state.chunkIndices.add(chunkIndex);
        state.metadata = {
          ...state.metadata,
          bytesWritten: state.metadata.bytesWritten + Math.max(0, bytesWritten),
          chunkCount: isNewChunk ? state.metadata.chunkCount + 1 : state.metadata.chunkCount,
          updatedAt: now(),
        };
        persist(state);
        return cloneMetadata(state.metadata);
      });
    },

    recordSubtitleBytes(bucketId, subtitleBytes) {
      return serialize(bucketId, async () => {
        const state = load(bucketId);
        state.metadata = {
          ...state.metadata,
          subtitleBytes: Math.max(0, subtitleBytes),
          updatedAt: now(),
        };
        persist(state);
        return cloneMetadata(state.metadata);
      });
    },

    async delete(bucketId) {
      buckets.delete(bucketId);
      persisted.delete(bucketId);
    },
  };
}
