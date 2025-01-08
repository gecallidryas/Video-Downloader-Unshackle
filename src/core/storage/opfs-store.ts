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
  };
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
