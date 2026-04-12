import type {
  GeneratedAssetMimeType,
  MediaAssetKind,
  NativeAssetReference,
} from '@/video_downloader_types_skeleton';
import type { NativeFfmpegClient } from '@/src/native/native-ffmpeg-client';

const MAX_BYTES_BY_KIND: Record<MediaAssetKind, number> = {
  poster: 2 * 1024 * 1024,
  hoverClip: 20 * 1024 * 1024,
};

// Chrome native messaging caps a single message at ~1 MB. Base64 inflates
// payloads by ~33%, so 512 KiB of raw bytes (~700 KiB base64) stays safely
// under the framing limit with room for the JSON envelope.
export const NATIVE_OUTPUT_CHUNK_BYTES = 512 * 1024;

export interface NativeOutputChunk {
  base64: string;
  sizeBytes: number;
  eof?: boolean;
}

export type ReadNativeOutputChunk = (input: {
  outputPath: string;
  offset: number;
  length: number;
}) => Promise<NativeOutputChunk>;

export interface ReadFullNativeOutputInput {
  outputPath: string;
  mimeType: string;
  totalBytes?: number;
}

export interface NativeOutputSink {
  write(chunk: Uint8Array): Promise<void>;
  finalize(): Promise<Blob>;
}

export interface CreateOutputSinkInput {
  outputPath: string;
  mimeType: string;
  totalBytes?: number;
}

export type CreateNativeOutputSink = (
  input: CreateOutputSinkInput,
) => Promise<NativeOutputSink>;

export interface NativeAssetServer {
  serve(ref: NativeAssetReference, kind: MediaAssetKind): Promise<string>;
  revoke(assetUrl: string): void;
  readFullOutput(input: ReadFullNativeOutputInput): Promise<Blob>;
}

export interface NativeAssetServerOptions {
  nativeClient: NativeFfmpegClient;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  readOutputChunk?: ReadNativeOutputChunk;
  chunkBytes?: number;
  createOutputSink?: CreateNativeOutputSink;
}

export function createNativeAssetServer(options: NativeAssetServerOptions): NativeAssetServer {
  const createObjectUrl =
    options.createObjectUrl ?? (typeof URL !== 'undefined' ? URL.createObjectURL.bind(URL) : undefined);
  const revokeObjectUrl =
    options.revokeObjectUrl ?? (typeof URL !== 'undefined' ? URL.revokeObjectURL.bind(URL) : undefined);
  const chunkBytes = options.chunkBytes ?? NATIVE_OUTPUT_CHUNK_BYTES;

  if (!createObjectUrl) {
    throw new Error('Blob URL creation is unavailable in this runtime.');
  }

  const createOutputSink =
    options.createOutputSink ?? defaultCreateOutputSink();

  async function readFullOutput(input: ReadFullNativeOutputInput): Promise<Blob> {
    const readChunk = options.readOutputChunk;

    if (!readChunk) {
      throw new Error('Chunked native output reads are not configured.');
    }

    const sink = await createOutputSink({
      outputPath: input.outputPath,
      mimeType: input.mimeType,
      ...(input.totalBytes !== undefined ? { totalBytes: input.totalBytes } : {}),
    });
    let offset = 0;

    while (true) {
      const chunk = await readChunk({
        outputPath: input.outputPath,
        offset,
        length: chunkBytes,
      });
      const bytes = base64ToBytes(chunk.base64);

      if (bytes.byteLength > 0) {
        await sink.write(bytes);
        offset += bytes.byteLength;
      }

      // Trust the authoritative eof flag from the helper. A short read (fewer
      // bytes than chunkBytes) is NOT a reliable end-of-file signal: the helper
      // may return a partial chunk mid-file. Only stop on an explicit eof, an
      // empty read (defensive against missing eof), or once we've consumed the
      // known total size.
      const reachedEnd =
        chunk.eof === true ||
        bytes.byteLength === 0 ||
        (input.totalBytes !== undefined && offset >= input.totalBytes);

      if (reachedEnd) {
        break;
      }
    }

    return sink.finalize();
  }

  return {
    async serve(ref, kind) {
      const maxBytes = MAX_BYTES_BY_KIND[kind];
      const result = await options.nativeClient.readAssetBytes({
        outputPath: ref.outputPath,
        maxBytes,
      });
      const bytes = base64ToBytes(result.base64);
      const mimeType = (result.mimeType ?? ref.mimeType) as GeneratedAssetMimeType;
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return createObjectUrl(new Blob([buffer], { type: mimeType }));
    },
    revoke(assetUrl) {
      revokeObjectUrl?.(assetUrl);
    },
    readFullOutput,
  };
}

interface OpfsWritableLike {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface OpfsFileHandleLike {
  createWritable(options?: { keepExistingData?: boolean }): Promise<OpfsWritableLike>;
  getFile(): Promise<Blob>;
}

interface OpfsDirectoryHandleLike {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandleLike>;
  removeEntry(name: string): Promise<void>;
}

interface OpfsStorageManagerLike {
  getDirectory(): Promise<OpfsDirectoryHandleLike>;
}

function getOpfsStorage(): OpfsStorageManagerLike | undefined {
  const storage =
    typeof navigator !== 'undefined'
      ? (navigator as { storage?: { getDirectory?: unknown } }).storage
      : undefined;

  return typeof storage?.getDirectory === 'function'
    ? (storage as unknown as OpfsStorageManagerLike)
    : undefined;
}

// Default streaming sink: when OPFS exists, decoded chunks are written straight
// to a temp on-disk file so the full (possibly multi-GB) export is never held
// in the JS heap at once; finalize() returns a disk-backed File. When OPFS is
// unavailable we fall back to in-memory accumulation, acceptable for the small
// payloads that runtime is likely to handle.
function defaultCreateOutputSink(): CreateNativeOutputSink {
  return async (input) => {
    const storage = getOpfsStorage();

    if (storage) {
      try {
        return await createOpfsOutputSink(storage, input);
      } catch {
        // Fall through to in-memory accumulation if OPFS setup fails.
      }
    }

    return createMemoryOutputSink(input.mimeType);
  };
}

function createMemoryOutputSink(mimeType: string): NativeOutputSink {
  const parts: ArrayBuffer[] = [];

  return {
    async write(chunk) {
      const buffer = new ArrayBuffer(chunk.byteLength);
      new Uint8Array(buffer).set(chunk);
      parts.push(buffer);
    },
    async finalize() {
      return new Blob(parts, { type: mimeType });
    },
  };
}

async function createOpfsOutputSink(
  storage: OpfsStorageManagerLike,
  input: CreateOutputSinkInput,
): Promise<NativeOutputSink> {
  const root = await storage.getDirectory();
  const fileName = `native-output-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  const handle = await root.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();

  return {
    async write(chunk) {
      await writable.write(chunk);
    },
    async finalize() {
      await writable.close();
      const file = await handle.getFile();
      // Re-tag the disk-backed file with the desired MIME type without copying
      // its bytes into memory.
      return new Blob([file], { type: input.mimeType });
    },
  };
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  throw new Error('Base64 decoding is unavailable in this runtime.');
}
