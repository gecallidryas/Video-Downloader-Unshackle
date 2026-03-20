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

  async function readFullOutput(input: ReadFullNativeOutputInput): Promise<Blob> {
    const readChunk = options.readOutputChunk;

    if (!readChunk) {
      throw new Error('Chunked native output reads are not configured.');
    }

    const parts: ArrayBuffer[] = [];
    let offset = 0;

    while (true) {
      const chunk = await readChunk({
        outputPath: input.outputPath,
        offset,
        length: chunkBytes,
      });
      const bytes = base64ToBytes(chunk.base64);

      if (bytes.byteLength > 0) {
        const buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
        parts.push(buffer);
        offset += bytes.byteLength;
      }

      const reachedEnd =
        chunk.eof === true ||
        bytes.byteLength === 0 ||
        bytes.byteLength < chunkBytes ||
        (input.totalBytes !== undefined && offset >= input.totalBytes);

      if (reachedEnd) {
        break;
      }
    }

    return new Blob(parts, { type: input.mimeType });
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
