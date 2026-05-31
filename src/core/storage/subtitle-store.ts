import type { SubtitleFormat } from '@/src/core/naming/subtitle-filename';

export interface SubtitleEntry {
  jobId: string;
  trackId: string;
  language?: string;
  format: SubtitleFormat;
  fileName?: string;
  content: string;
}

export interface SubtitleStore {
  put(entry: SubtitleEntry): Promise<void>;
  listByJob(jobId: string): Promise<SubtitleEntry[]>;
  deleteJob(jobId: string): Promise<void>;
  estimateBytes(): Promise<number>;
}

export interface IndexedDbSubtitleStoreOptions {
  mode?: 'indexeddb' | 'memory';
  dbName?: string;
}

const DEFAULT_DB_NAME = 'unshackle_subtitles';
const STORE_NAME = 'subtitles';

function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }

  return value.length;
}

function compositeKey(jobId: string, trackId: string): string {
  return `${jobId}::${trackId}`;
}

export function createInMemorySubtitleStore(): SubtitleStore {
  const entries = new Map<string, SubtitleEntry>();

  return {
    async put(entry) {
      entries.set(compositeKey(entry.jobId, entry.trackId), { ...entry });
    },

    async listByJob(jobId) {
      return Array.from(entries.values()).filter((entry) => entry.jobId === jobId);
    },

    async deleteJob(jobId) {
      for (const k of Array.from(entries.keys())) {
        if (k.startsWith(`${jobId}::`)) {
          entries.delete(k);
        }
      }
    },

    async estimateBytes() {
      let total = 0;
      for (const entry of entries.values()) {
        total += byteLength(entry.content);
      }
      return total;
    },
  };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

interface StoredSubtitleRecord extends SubtitleEntry {
  key: string;
  byteSize: number;
}

class BrowserIndexedDbSubtitleStore implements SubtitleStore {
  private database: IDBDatabase | undefined;

  constructor(private readonly dbName: string) {}

  private async open(): Promise<IDBDatabase> {
    if (this.database) {
      return this.database;
    }

    const request = indexedDB.open(this.dbName, 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('jobId', 'jobId', { unique: false });
      }
    };

    this.database = await requestToPromise(request);
    return this.database;
  }

  async put(entry: SubtitleEntry): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const record: StoredSubtitleRecord = {
      ...entry,
      key: compositeKey(entry.jobId, entry.trackId),
      byteSize: byteLength(entry.content),
    };

    await requestToPromise(store.put(record));
  }

  async listByJob(jobId: string): Promise<SubtitleEntry[]> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('jobId');
    const records = await requestToPromise<StoredSubtitleRecord[]>(
      index.getAll(IDBKeyRange.only(jobId)),
    );

    return records.map(({ key: _key, byteSize: _byteSize, ...entry }) => entry);
  }

  async deleteJob(jobId: string): Promise<void> {
    const database = await this.open();

    // Read the keys in their own transaction first. Issuing store.delete() after
    // awaiting a request on the SAME transaction races the auto-commit and throws
    // TransactionInactiveError, so the deletes run in a fresh readwrite
    // transaction where every request is placed synchronously before any await.
    const readTx = database.transaction(STORE_NAME, 'readonly');
    const keys = await requestToPromise<IDBValidKey[]>(
      readTx.objectStore(STORE_NAME).index('jobId').getAllKeys(IDBKeyRange.only(jobId)),
    );

    if (keys.length === 0) {
      return;
    }

    const deleteTx = database.transaction(STORE_NAME, 'readwrite');
    const deleteStore = deleteTx.objectStore(STORE_NAME);
    await Promise.all(keys.map((key) => requestToPromise(deleteStore.delete(key))));
  }

  async estimateBytes(): Promise<number> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const records = await requestToPromise<StoredSubtitleRecord[]>(store.getAll());

    return records.reduce(
      (sum, record) => sum + (record.byteSize ?? byteLength(record.content)),
      0,
    );
  }
}

export function createIndexedDbSubtitleStore(
  options: IndexedDbSubtitleStoreOptions = {},
): SubtitleStore {
  const indexedDbAvailable = options.mode !== 'memory' && typeof indexedDB !== 'undefined';

  if (!indexedDbAvailable) {
    return createInMemorySubtitleStore();
  }

  return new BrowserIndexedDbSubtitleStore(options.dbName ?? DEFAULT_DB_NAME);
}
