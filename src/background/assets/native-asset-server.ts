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

export interface NativeAssetServer {
  serve(ref: NativeAssetReference, kind: MediaAssetKind): Promise<string>;
  revoke(assetUrl: string): void;
}

export interface NativeAssetServerOptions {
  nativeClient: NativeFfmpegClient;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

export function createNativeAssetServer(options: NativeAssetServerOptions): NativeAssetServer {
  const createObjectUrl =
    options.createObjectUrl ?? (typeof URL !== 'undefined' ? URL.createObjectURL.bind(URL) : undefined);
  const revokeObjectUrl =
    options.revokeObjectUrl ?? (typeof URL !== 'undefined' ? URL.revokeObjectURL.bind(URL) : undefined);

  if (!createObjectUrl) {
    throw new Error('Blob URL creation is unavailable in this runtime.');
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
