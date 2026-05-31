export interface BucketMetadata {
  bucketId: string;
  bytesWritten: number;
  chunkCount: number;
  subtitleBytes: number;
  updatedAt: number;
}

// Durable backing store for serialized bucket metadata. Implementations persist
// to chrome.storage.local (production) so segment/byte counts survive a service
// worker restart and can be rehydrated on wakeup.
export interface BucketMetadataPersistence {
  loadAll(): Promise<Record<string, string>>;
  save(bucketId: string, serialized: string): Promise<void>;
  remove(bucketId: string): Promise<void>;
}

export interface BucketMetadataStoreOptions {
  persisted?: Map<string, string>;
  persistence?: BucketMetadataPersistence;
  now?: () => number;
}

export interface BucketMetadataStore {
  get(bucketId: string): Promise<BucketMetadata | undefined>;
  list(): Promise<BucketMetadata[]>;
  recordChunk(bucketId: string, chunkIndex: number, bytesWritten: number): Promise<BucketMetadata>;
  recordSubtitleBytes(bucketId: string, subtitleBytes: number): Promise<BucketMetadata>;
  delete(bucketId: string): Promise<void>;
  rehydrate(): Promise<void>;
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
  const persistence = options.persistence;
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

  async function persist(state: BucketState): Promise<void> {
    const serialized = JSON.stringify(state.metadata);
    persisted.set(state.metadata.bucketId, serialized);
    await persistence?.save(state.metadata.bucketId, serialized);
  }

  return {
    async get(bucketId) {
      const raw = persisted.get(bucketId);
      if (!raw && !buckets.has(bucketId)) {
        return undefined;
      }

      return cloneMetadata(load(bucketId).metadata);
    },

    async list() {
      const ids = new Set<string>([...persisted.keys(), ...buckets.keys()]);
      return Array.from(ids, (bucketId) => cloneMetadata(load(bucketId).metadata));
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
        await persist(state);
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
        await persist(state);
        return cloneMetadata(state.metadata);
      });
    },

    async delete(bucketId) {
      buckets.delete(bucketId);
      persisted.delete(bucketId);
      await persistence?.remove(bucketId);
    },

    async rehydrate() {
      if (!persistence) {
        return;
      }

      const all = await persistence.loadAll();
      for (const [bucketId, serialized] of Object.entries(all)) {
        persisted.set(bucketId, serialized);
        // Drop any stale in-memory state so the next load() reads fresh bytes.
        buckets.delete(bucketId);
      }
    },
  };
}
