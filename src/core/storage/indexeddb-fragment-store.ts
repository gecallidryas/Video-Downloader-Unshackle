export interface FragmentStore {
  createBucket(jobId: string): Promise<void>;
  writeFragment(jobId: string, index: number, data: Uint8Array | ArrayBuffer | Blob): Promise<void>;
  readFragment(jobId: string, index: number): Promise<Uint8Array | null>;
  readAllFragments(jobId: string): Promise<Uint8Array[]>;
  listFragmentIndices(jobId: string): Promise<number[]>;
  deleteBucket(jobId: string): Promise<void>;
  cleanupOrphanedBuckets(activeJobIds?: Set<string>): Promise<number>;
  isAvailable(): boolean;
}

export interface IndexedDbFragmentStoreOptions {
  mode?: 'indexeddb' | 'memory';
  dbPrefix?: string;
}

const DEFAULT_DB_PREFIX = 'unshackle_segments_';
const STORE_NAME = 'fragments';

async function toBytes(data: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> {
  if (data instanceof Uint8Array) {
    return new Uint8Array(data);
  }

  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }

  return new Uint8Array(data.slice(0));
}

function cloneBytes(data: Uint8Array): Uint8Array {
  return new Uint8Array(data);
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength);

  new Uint8Array(buffer).set(data);

  return buffer;
}

class MemoryFragmentStore implements FragmentStore {
  private readonly buckets = new Map<string, Map<number, Uint8Array>>();

  async createBucket(jobId: string): Promise<void> {
    if (!this.buckets.has(jobId)) {
      this.buckets.set(jobId, new Map());
    }
  }

  async writeFragment(
    jobId: string,
    index: number,
    data: Uint8Array | ArrayBuffer | Blob,
  ): Promise<void> {
    const bucket = this.getBucket(jobId);

    bucket.set(index, await toBytes(data));
  }

  async readFragment(jobId: string, index: number): Promise<Uint8Array | null> {
    const fragment = this.getBucket(jobId).get(index);

    return fragment ? cloneBytes(fragment) : null;
  }

  async readAllFragments(jobId: string): Promise<Uint8Array[]> {
    return Array.from(this.getBucket(jobId).entries())
      .sort(([left], [right]) => left - right)
      .map(([, value]) => cloneBytes(value));
  }

  async listFragmentIndices(jobId: string): Promise<number[]> {
    return Array.from(this.getBucket(jobId).keys()).sort((left, right) => left - right);
  }

  async deleteBucket(jobId: string): Promise<void> {
    this.buckets.delete(jobId);
  }

  async cleanupOrphanedBuckets(activeJobIds: Set<string> = new Set()): Promise<number> {
    let cleaned = 0;

    for (const jobId of Array.from(this.buckets.keys())) {
      if (!activeJobIds.has(jobId)) {
        this.buckets.delete(jobId);
        cleaned += 1;
      }
    }

    return cleaned;
  }

  isAvailable(): boolean {
    return true;
  }

  private getBucket(jobId: string): Map<number, Uint8Array> {
    const bucket = this.buckets.get(jobId);

    if (!bucket) {
      throw new Error(`Bucket ${jobId} not found.`);
    }

    return bucket;
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

class BrowserIndexedDbFragmentStore implements FragmentStore {
  private readonly databases = new Map<string, IDBDatabase>();

  constructor(private readonly dbPrefix: string) {}

  async createBucket(jobId: string): Promise<void> {
    if (this.databases.has(jobId)) {
      return;
    }

    const request = indexedDB.open(this.databaseName(jobId), 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'index' });
      }
    };

    const database = await requestToPromise(request);
    this.databases.set(jobId, database);
  }

  async writeFragment(
    jobId: string,
    index: number,
    data: Uint8Array | ArrayBuffer | Blob,
  ): Promise<void> {
    const bytes = await toBytes(data);
    const transaction = this.database(jobId).transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await requestToPromise(
      store.put({
        index,
        data: new Blob([toArrayBuffer(bytes)]),
        size: bytes.byteLength,
      }),
    );
  }

  async readFragment(jobId: string, index: number): Promise<Uint8Array | null> {
    const transaction = this.database(jobId).transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const result = await requestToPromise<FragmentEntry | undefined>(store.get(index));

    return result ? toBytes(result.data) : null;
  }

  async readAllFragments(jobId: string): Promise<Uint8Array[]> {
    const transaction = this.database(jobId).transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const entries = await requestToPromise<FragmentEntry[]>(store.getAll());

    return Promise.all(
      entries
        .sort((left, right) => left.index - right.index)
        .map((entry) => toBytes(entry.data)),
    );
  }

  async listFragmentIndices(jobId: string): Promise<number[]> {
    const transaction = this.database(jobId).transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    if (typeof store.getAllKeys === 'function') {
      const keys = await requestToPromise<IDBValidKey[]>(store.getAllKeys());

      return keys.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
    }

    const entries = await requestToPromise<FragmentEntry[]>(store.getAll());

    return entries.map((entry) => entry.index).sort((left, right) => left - right);
  }

  async deleteBucket(jobId: string): Promise<void> {
    const database = this.databases.get(jobId);

    database?.close();
    this.databases.delete(jobId);

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.databaseName(jobId));

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      request.onblocked = () => resolve();
    });
  }

  async cleanupOrphanedBuckets(activeJobIds: Set<string> = new Set()): Promise<number> {
    if (typeof indexedDB.databases !== 'function') {
      return 0;
    }

    const databases = await indexedDB.databases();
    let cleaned = 0;

    for (const database of databases) {
      if (!database.name?.startsWith(this.dbPrefix)) {
        continue;
      }

      const jobId = database.name.slice(this.dbPrefix.length);

      if (activeJobIds.has(jobId)) {
        continue;
      }

      await this.deleteBucket(jobId);
      cleaned += 1;
    }

    return cleaned;
  }

  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private databaseName(jobId: string): string {
    return `${this.dbPrefix}${jobId}`;
  }

  private database(jobId: string): IDBDatabase {
    const database = this.databases.get(jobId);

    if (!database) {
      throw new Error(`Bucket ${jobId} not found.`);
    }

    return database;
  }
}

interface FragmentEntry {
  index: number;
  data: Blob;
  size: number;
}

export function createIndexedDbFragmentStore(
  options: IndexedDbFragmentStoreOptions = {},
): FragmentStore {
  const indexedDbAvailable =
    options.mode !== 'memory' && typeof indexedDB !== 'undefined';

  if (!indexedDbAvailable) {
    return new MemoryFragmentStore();
  }

  return new BrowserIndexedDbFragmentStore(options.dbPrefix ?? DEFAULT_DB_PREFIX);
}
