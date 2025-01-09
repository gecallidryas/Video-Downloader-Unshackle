import type { BinaryStore } from '@/video_downloader_types_skeleton';

async function toBlob(data: ArrayBuffer | Uint8Array | Blob): Promise<Blob> {
  if (data instanceof Blob) {
    return data;
  }

  if (data instanceof Uint8Array) {
    const buffer = new ArrayBuffer(data.byteLength);

    new Uint8Array(buffer).set(data);

    return new Blob([buffer]);
  }

  return new Blob([data]);
}

export function createMemoryBinaryStore(): BinaryStore {
  const files = new Map<string, Blob>();
  const store = {
    async list(prefix = '') {
      return Array.from(files.keys()).filter((path) => path.startsWith(prefix));
    },
  };

  return {
    async put(path, data) {
      files.set(path, await toBlob(data));
    },

    async get(path) {
      const file = files.get(path);

      if (!file) {
        throw new Error(`Binary object not found: ${path}`);
      }

      return file;
    },

    async delete(path) {
      files.delete(path);
    },

    async exists(path) {
      return files.has(path);
    },
    ...store,
  };
}

export interface BinaryStoreWithListing extends BinaryStore {
  list?(prefix?: string): Promise<string[]>;
}

interface FileHandleLike {
  getFile(): Promise<Blob>;
  createWritable(): Promise<{
    write(data: ArrayBuffer | Uint8Array | Blob): Promise<void>;
    close(): Promise<void>;
  }>;
}

interface DirectoryHandleLike {
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<DirectoryHandleLike>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
}

async function getParentDirectory(
  root: DirectoryHandleLike,
  path: string,
  create: boolean,
): Promise<{ directory: DirectoryHandleLike; fileName: string }> {
  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop();

  if (!fileName) {
    throw new Error('Binary object path must include a file name.');
  }

  let directory = root;

  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create });
  }

  return { directory, fileName };
}

export async function createOpfsBinaryStore(): Promise<BinaryStore> {
  const root = await navigator.storage.getDirectory() as DirectoryHandleLike;
  const store: BinaryStore = {
    async put(path, data) {
      const { directory, fileName } = await getParentDirectory(root, path, true);
      const file = await directory.getFileHandle(fileName, { create: true });
      const writable = await file.createWritable();

      await writable.write(data);
      await writable.close();
    },

    async get(path) {
      const { directory, fileName } = await getParentDirectory(root, path, false);
      const file = await directory.getFileHandle(fileName);

      return file.getFile();
    },

    async delete(path) {
      const { directory, fileName } = await getParentDirectory(root, path, false);

      await directory.removeEntry(fileName);
    },

    async exists(path) {
      try {
        await store.get(path);

        return true;
      } catch {
        return false;
      }
    },
  };

  return store;
}

export interface OpfsJobStore {
  writeStream(
    jobId: string,
    filename: string,
    chunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
  ): Promise<string>;
  readFile(jobId: string, filename: string): Promise<Uint8Array>;
  listFiles(jobId: string): Promise<string[]>;
  deleteJobDirectory(jobId: string): Promise<void>;
}

function jobPath(jobId: string, filename: string): string {
  return `jobs/${jobId}/${filename}`;
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  const blobWithArrayBuffer = blob as Blob & {
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };

  if (typeof blobWithArrayBuffer.arrayBuffer === 'function') {
    return new Uint8Array(await blobWithArrayBuffer.arrayBuffer());
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => {
      const result = reader.result;

      if (result instanceof ArrayBuffer) {
        resolve(new Uint8Array(result));
        return;
      }

      resolve(new TextEncoder().encode(String(result ?? '')));
    });
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsArrayBuffer(blob);
  });
}

export function createOpfsJobStore(binaryStore: BinaryStoreWithListing): OpfsJobStore {
  const filesByJob = new Map<string, Set<string>>();

  return {
    async writeStream(jobId, filename, chunks) {
      const parts: Uint8Array[] = [];

      for await (const chunk of chunks) {
        parts.push(chunk);
      }

      const byteLength = parts.reduce((total, part) => total + part.byteLength, 0);
      const bytes = new Uint8Array(byteLength);
      let offset = 0;

      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
      }

      await binaryStore.put(jobPath(jobId, filename), bytes);

      if (!filesByJob.has(jobId)) {
        filesByJob.set(jobId, new Set());
      }

      filesByJob.get(jobId)?.add(filename);

      return filename;
    },

    async readFile(jobId, filename) {
      return blobToBytes(await binaryStore.get(jobPath(jobId, filename)));
    },

    async listFiles(jobId) {
      const tracked = filesByJob.get(jobId);

      if (tracked) {
        return Array.from(tracked).sort();
      }

      const paths = await binaryStore.list?.(`jobs/${jobId}/`);

      return paths?.map((path) => path.split('/').pop()).filter((name): name is string => Boolean(name)) ?? [];
    },

    async deleteJobDirectory(jobId) {
      const tracked = await this.listFiles(jobId);

      for (const filename of tracked) {
        await binaryStore.delete(jobPath(jobId, filename));
      }

      filesByJob.delete(jobId);
    },
  };
}

export interface StorageManagerLike {
  getDirectory?: () => Promise<unknown>;
}

export async function createBestAvailableBinaryStore(
  navigatorLike: { storage?: StorageManagerLike } = navigator,
): Promise<BinaryStore> {
  if (typeof navigatorLike.storage?.getDirectory === 'function') {
    return createOpfsBinaryStore();
  }

  return createMemoryBinaryStore();
}
