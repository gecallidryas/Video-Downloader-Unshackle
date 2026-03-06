type FileSystemPermissionMode = 'read' | 'readwrite';

type FileSystemPermissionState = 'granted' | 'denied' | 'prompt';

interface FileSystemWritableLike {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableLike>;
}

export interface FileSystemDirectoryHandleLike {
  queryPermission(descriptor?: { mode?: FileSystemPermissionMode }): Promise<FileSystemPermissionState>;
  requestPermission(descriptor?: { mode?: FileSystemPermissionMode }): Promise<FileSystemPermissionState>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandleLike>;
}

export interface FileSystemAccessStoreOptions {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike>;
  initialDirectoryHandle?: FileSystemDirectoryHandleLike;
  persistDirectoryHandle?: (handle: FileSystemDirectoryHandleLike) => Promise<void>;
}

export interface ChooseOutputDirectoryOptions {
  userGesture: boolean;
  remember: boolean;
}

export interface FileSystemAccessStore {
  isAvailable(): boolean;
  chooseDirectory(options: ChooseOutputDirectoryOptions): Promise<void>;
  verifyWritePermission(): Promise<boolean>;
  writeFile(fileName: string, data: Uint8Array): Promise<void>;
}

const directoryHandleDbName = 'unshackle-file-system-access';
const directoryHandleStoreName = 'handles';
const outputDirectoryHandleKey = 'output-directory';

function openDirectoryHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(directoryHandleDbName, 1);

    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(directoryHandleStoreName);
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('Failed to open output directory handle database.')),
    );
  });
}

function isFileSystemDirectoryHandleLike(
  value: unknown,
): value is FileSystemDirectoryHandleLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<FileSystemDirectoryHandleLike>).queryPermission === 'function' &&
    typeof (value as Partial<FileSystemDirectoryHandleLike>).requestPermission === 'function' &&
    typeof (value as Partial<FileSystemDirectoryHandleLike>).getFileHandle === 'function'
  );
}

export async function persistOutputDirectoryHandle(
  handle: FileSystemDirectoryHandleLike,
): Promise<void> {
  const db = await openDirectoryHandleDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(directoryHandleStoreName, 'readwrite');
    transaction.objectStore(directoryHandleStoreName).put(handle, outputDirectoryHandleKey);
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('error', () =>
      reject(transaction.error ?? new Error('Failed to persist output directory handle.')),
    );
  });
  db.close();
}

export async function loadPersistedOutputDirectoryHandle(): Promise<
  FileSystemDirectoryHandleLike | undefined
> {
  if (typeof indexedDB === 'undefined') {
    return undefined;
  }

  const db = await openDirectoryHandleDb();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(directoryHandleStoreName, 'readonly');
      const request = transaction.objectStore(directoryHandleStoreName).get(outputDirectoryHandleKey);

      request.addEventListener('success', () => {
        resolve(isFileSystemDirectoryHandleLike(request.result) ? request.result : undefined);
      });
      request.addEventListener('error', () =>
        reject(request.error ?? new Error('Failed to load output directory handle.')),
      );
    });
  } finally {
    db.close();
  }
}

export function createFileSystemAccessStore(
  options: FileSystemAccessStoreOptions = {},
): FileSystemAccessStore {
  const picker =
    options.showDirectoryPicker ??
    ((globalThis as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike> })
      .showDirectoryPicker);
  let directoryHandle = options.initialDirectoryHandle;

  return {
    isAvailable() {
      return typeof picker === 'function';
    },

    async chooseDirectory({ userGesture, remember }) {
      if (!userGesture) {
        throw new Error('Choosing an output folder requires a user gesture.');
      }
      if (!picker) {
        throw new Error('File System Access directory picker is unavailable.');
      }

      directoryHandle = await picker();

      if (remember) {
        await options.persistDirectoryHandle?.(directoryHandle);
      }
    },

    async verifyWritePermission() {
      if (!directoryHandle) {
        return false;
      }

      const descriptor = { mode: 'readwrite' as const };
      const existing = await directoryHandle.queryPermission(descriptor);

      if (existing === 'granted') {
        return true;
      }
      if (existing === 'denied') {
        return false;
      }

      return (await directoryHandle.requestPermission(descriptor)) === 'granted';
    },

    async writeFile(fileName, data) {
      if (!directoryHandle) {
        throw new Error('No output folder has been selected.');
      }
      if (!(await this.verifyWritePermission())) {
        throw new Error('Output folder write permission was denied.');
      }

      const file = await directoryHandle.getFileHandle(fileName, { create: true });
      const writable = await file.createWritable();
      await writable.write(data);
      await writable.close();
    },
  };
}
