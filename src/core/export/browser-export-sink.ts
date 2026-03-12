import type { JobOutput } from '@/video_downloader_types_skeleton';
import type { BrowserExportSinkKind } from '@/src/shared/contracts/offscreen';
import {
  loadPersistedOutputDirectoryHandle,
  type FileSystemDirectoryHandleLike,
} from '@/src/core/storage/file-system-access-store';

export interface BrowserExportSink {
  readonly kind: BrowserExportSinkKind;
  readonly bytesWritten: number;
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<JobOutput>;
  abort(reason?: unknown): Promise<void>;
}

export interface BrowserExportSinkInput {
  jobId: string;
  fileName: string;
  mimeType: string;
  saveAs?: boolean;
  memoryCeilingBytes?: number;
  download?: (options: chrome.downloads.DownloadOptions) => Promise<number>;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  deferDownload?: boolean;
}

interface WritableFileLike {
  write(data: Uint8Array | Blob | ArrayBuffer): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

interface FileHandleWithFile {
  createWritable(): Promise<WritableFileLike>;
  getFile(): Promise<Blob>;
}

interface DirectoryHandleWithRemove extends FileSystemDirectoryHandleLike {
  removeEntry?(name: string): Promise<void>;
}

const DEFAULT_MEMORY_CEILING_BYTES = 150 * 1024 * 1024;

function copyChunk(chunk: Uint8Array): Uint8Array {
  const copy = new Uint8Array(chunk.byteLength);

  copy.set(chunk);

  return copy;
}

function createObjectUrlForBlob(
  blob: Blob,
  createObjectUrl?: (blob: Blob) => string,
): string {
  const create =
    createObjectUrl ??
    (typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL.bind(URL)
      : undefined);

  if (!create) {
    throw new Error('Browser export requires URL.createObjectURL support.');
  }

  return create(blob);
}

function revokeObjectUrlLater(
  url: string,
  revokeObjectUrl?: (url: string) => void,
): void {
  const revoke =
    revokeObjectUrl ??
    (typeof URL.revokeObjectURL === 'function'
      ? URL.revokeObjectURL.bind(URL)
      : undefined);

  if (revoke) {
    setTimeout(() => revoke(url), 30_000);
  }
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(buffer).set(bytes);

  return buffer;
}

async function startDownload(input: {
  url: string;
  fileName: string;
  saveAs?: boolean;
  download?: (options: chrome.downloads.DownloadOptions) => Promise<number>;
}): Promise<number> {
  const download = input.download ?? chrome.downloads.download;

  return download({
    url: input.url,
    filename: input.fileName,
    saveAs: Boolean(input.saveAs),
  });
}

async function fileFromOpfs(path: string): Promise<Blob> {
  const root = await navigator.storage.getDirectory();
  const segments = path.split('/').filter(Boolean);
  const fileName = segments.pop();

  if (!fileName) {
    throw new Error('OPFS path must include a file name.');
  }

  let directory = root;

  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create: false });
  }

  const handle = await directory.getFileHandle(fileName, { create: false });

  return handle.getFile();
}

export class BlobMemorySink implements BrowserExportSink {
  readonly kind = 'blob-memory' as const;
  #parts: Uint8Array[] = [];
  #closed = false;
  #bytesWritten = 0;
  readonly #input: BrowserExportSinkInput;
  readonly #memoryCeilingBytes: number;

  constructor(input: BrowserExportSinkInput) {
    this.#input = input;
    this.#memoryCeilingBytes = input.memoryCeilingBytes ?? DEFAULT_MEMORY_CEILING_BYTES;
  }

  get bytesWritten(): number {
    return this.#bytesWritten;
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (this.#closed) {
      throw new Error('Cannot write to a closed browser export sink.');
    }

    const nextSize = this.#bytesWritten + chunk.byteLength;

    if (nextSize > this.#memoryCeilingBytes) {
      throw new Error(
        `Browser memory export exceeded the safe limit (${String(nextSize)} bytes > ${String(this.#memoryCeilingBytes)} bytes).`,
      );
    }

    this.#parts.push(copyChunk(chunk));
    this.#bytesWritten = nextSize;
  }

  async close(): Promise<JobOutput> {
    this.#closed = true;
    const blob = new Blob(this.#parts.map(arrayBufferFromBytes), { type: this.#input.mimeType });
    const outputUrl = createObjectUrlForBlob(blob, this.#input.createObjectUrl);
    const downloadId = this.#input.deferDownload
      ? undefined
      : await startDownload({
          url: outputUrl,
          fileName: this.#input.fileName,
          saveAs: this.#input.saveAs,
          download: this.#input.download,
        });

    revokeObjectUrlLater(outputUrl, this.#input.revokeObjectUrl);

    return {
      fileName: this.#input.fileName,
      mimeType: this.#input.mimeType,
      outputUrl,
      ...(downloadId === undefined ? {} : { downloadId }),
      sizeBytes: this.#bytesWritten,
    };
  }

  async abort(_reason?: unknown): Promise<void> {
    this.#closed = true;
    this.#parts = [];
    this.#bytesWritten = 0;
  }
}

export class OpfsStagingSink implements BrowserExportSink {
  readonly kind = 'opfs' as const;
  #closed = false;
  #bytesWritten = 0;
  #writable?: WritableFileLike;
  readonly #input: BrowserExportSinkInput;
  readonly #path: string;

  constructor(input: BrowserExportSinkInput) {
    this.#input = input;
    this.#path = `browser-hls-export/${input.jobId}/${input.fileName}`;
  }

  get bytesWritten(): number {
    return this.#bytesWritten;
  }

  async #getWritable(): Promise<WritableFileLike> {
    if (this.#writable) {
      return this.#writable;
    }

    if (typeof navigator.storage?.getDirectory !== 'function') {
      throw new Error('OPFS is unavailable for browser export staging.');
    }

    const root = await navigator.storage.getDirectory();
    const jobDirectory = await root
      .getDirectoryHandle('browser-hls-export', { create: true })
      .then((directory) => directory.getDirectoryHandle(this.#input.jobId, { create: true }));
    const file = await jobDirectory.getFileHandle(this.#input.fileName, {
      create: true,
    });

    const writable = await file.createWritable() as WritableFileLike;
    this.#writable = writable;

    return writable;
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (this.#closed) {
      throw new Error('Cannot write to a closed browser export sink.');
    }

    const writable = await this.#getWritable();

    await writable.write(arrayBufferFromBytes(chunk));
    this.#bytesWritten += chunk.byteLength;
  }

  async close(): Promise<JobOutput> {
    this.#closed = true;
    const writable = await this.#getWritable();

    await writable.close();
    const blob = await fileFromOpfs(this.#path);
    const outputUrl = createObjectUrlForBlob(blob, this.#input.createObjectUrl);
    const downloadId = this.#input.deferDownload
      ? undefined
      : await startDownload({
          url: outputUrl,
          fileName: this.#input.fileName,
          saveAs: this.#input.saveAs,
          download: this.#input.download,
        });

    revokeObjectUrlLater(outputUrl, this.#input.revokeObjectUrl);

    return {
      fileName: this.#input.fileName,
      mimeType: this.#input.mimeType,
      outputUrl,
      ...(downloadId === undefined ? {} : { downloadId }),
      opfsPath: this.#path,
      sizeBytes: this.#bytesWritten,
      notes: ['Staged browser HLS output in OPFS before saving.'],
    };
  }

  async abort(reason?: unknown): Promise<void> {
    this.#closed = true;
    await this.#writable?.abort?.(reason);

    try {
      const root = await navigator.storage.getDirectory();
      const exportDirectory = await root.getDirectoryHandle('browser-hls-export', { create: false });
      const jobDirectory = await exportDirectory.getDirectoryHandle(this.#input.jobId, { create: false });

      await jobDirectory.removeEntry(this.#input.fileName);
    } catch {
      // Best-effort cleanup: the file may not have been created yet.
    }
  }
}

export class FileSystemAccessSink implements BrowserExportSink {
  readonly kind = 'file-system-access' as const;
  #closed = false;
  #bytesWritten = 0;
  #writable?: WritableFileLike;
  readonly #input: BrowserExportSinkInput;
  readonly #directoryHandle: DirectoryHandleWithRemove;

  constructor(input: BrowserExportSinkInput, directoryHandle: DirectoryHandleWithRemove) {
    this.#input = input;
    this.#directoryHandle = directoryHandle;
  }

  get bytesWritten(): number {
    return this.#bytesWritten;
  }

  async #getWritable(): Promise<WritableFileLike> {
    if (this.#writable) {
      return this.#writable;
    }

    const permission = await this.#directoryHandle.queryPermission({ mode: 'readwrite' });
    const granted =
      permission === 'granted' ||
      (permission === 'prompt' &&
        (await this.#directoryHandle.requestPermission({ mode: 'readwrite' })) === 'granted');

    if (!granted) {
      throw new Error('Output folder write permission was denied.');
    }

    const file = await this.#directoryHandle.getFileHandle(this.#input.fileName, {
      create: true,
    }) as FileHandleWithFile;

    const writable = await file.createWritable() as WritableFileLike;
    this.#writable = writable;

    return writable;
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (this.#closed) {
      throw new Error('Cannot write to a closed browser export sink.');
    }

    const writable = await this.#getWritable();

    await writable.write(arrayBufferFromBytes(chunk));
    this.#bytesWritten += chunk.byteLength;
  }

  async close(): Promise<JobOutput> {
    this.#closed = true;
    const writable = await this.#getWritable();

    await writable.close();

    return {
      fileName: this.#input.fileName,
      mimeType: this.#input.mimeType,
      outputUrl: `file-system-access://${this.#input.fileName}`,
      sizeBytes: this.#bytesWritten,
      notes: ['Saved directly to the selected output folder.'],
    };
  }

  async abort(reason?: unknown): Promise<void> {
    this.#closed = true;
    await this.#writable?.abort?.(reason);
    await this.#directoryHandle.removeEntry?.(this.#input.fileName);
  }
}

export async function createBrowserExportSink(
  kind: BrowserExportSinkKind,
  input: BrowserExportSinkInput,
): Promise<BrowserExportSink> {
  if (kind === 'file-system-access') {
    const directoryHandle = await loadPersistedOutputDirectoryHandle();

    if (!directoryHandle) {
      throw new Error('No persisted output folder is available for direct browser export.');
    }

    return new FileSystemAccessSink(input, directoryHandle);
  }

  if (kind === 'opfs') {
    return new OpfsStagingSink(input);
  }

  if (kind === 'blob-memory' || kind === 'chrome-download') {
    return new BlobMemorySink(input);
  }

  throw new Error(`Unsupported browser export sink: ${kind}`);
}
