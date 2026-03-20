import { describe, expect, test, vi } from 'vitest';
import { createNativeAssetServer } from '../native-asset-server';
import type { NativeFfmpegClient } from '@/src/native/native-ffmpeg-client';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function nativeClient(): NativeFfmpegClient {
  return {
    ping: vi.fn(),
    exportMedia: vi.fn(),
    extractThumbnail: vi.fn(),
    extractPreviewClip: vi.fn(),
    readAssetBytes: vi.fn().mockResolvedValue({
      outputPath: '/helper/previews/candidate.webm',
      sizeBytes: 5,
      base64: 'aGVsbG8=',
      mimeType: 'video/webm',
    }),
    cancelJob: vi.fn(),
    cleanupJob: vi.fn(),
  } as unknown as NativeFfmpegClient;
}

describe('native asset server', () => {
  test('reads helper-owned bytes and creates an extension-safe blob URL', async () => {
    const client = nativeClient();
    const createObjectUrl = vi.fn().mockReturnValue('blob:extension-preview');
    const server = createNativeAssetServer({
      nativeClient: client,
      createObjectUrl,
      revokeObjectUrl: vi.fn(),
    });

    await expect(
      server.serve(
        {
          outputPath: '/helper/previews/candidate.webm',
          mimeType: 'video/webm',
          sizeBytes: 5,
        },
        'hoverClip',
      ),
    ).resolves.toBe('blob:extension-preview');
    expect(client.readAssetBytes).toHaveBeenCalledWith({
      outputPath: '/helper/previews/candidate.webm',
      maxBytes: 20 * 1024 * 1024,
    });
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
  });

  test('revokes blob URLs on eviction', () => {
    const revokeObjectUrl = vi.fn();
    const server = createNativeAssetServer({
      nativeClient: nativeClient(),
      createObjectUrl: vi.fn().mockReturnValue('blob:asset'),
      revokeObjectUrl,
    });

    server.revoke('blob:asset');

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:asset');
  });

  test('readFullOutput assembles a large multi-chunk output in order', async () => {
    const chunkBytes = 4;
    const source = new Uint8Array([10, 11, 12, 13, 20, 21, 22, 23, 30, 31]);
    const readOutputChunk = vi.fn(async ({ offset, length }: { offset: number; length: number }) => {
      const slice = source.subarray(offset, offset + length);
      return {
        base64: bytesToBase64(slice),
        sizeBytes: slice.byteLength,
        eof: offset + slice.byteLength >= source.byteLength,
      };
    });

    const server = createNativeAssetServer({
      nativeClient: nativeClient(),
      createObjectUrl: vi.fn(),
      revokeObjectUrl: vi.fn(),
      readOutputChunk,
      chunkBytes,
    });

    const blob = await server.readFullOutput({
      outputPath: 'C:\\outputs\\big.mp4',
      mimeType: 'video/mp4',
      totalBytes: source.byteLength,
    });

    expect(await blobBytes(blob)).toEqual(source);
    expect(blob.type).toBe('video/mp4');
    expect(readOutputChunk).toHaveBeenCalledTimes(3);
    expect(readOutputChunk.mock.calls.map((call) => call[0].offset)).toEqual([0, 4, 8]);
  });

  test('readFullOutput stops on a short final chunk without an explicit eof flag', async () => {
    const chunkBytes = 4;
    const source = new Uint8Array([1, 2, 3, 4, 5]);
    const readOutputChunk = vi.fn(async ({ offset, length }: { offset: number; length: number }) => {
      const slice = source.subarray(offset, offset + length);
      return { base64: bytesToBase64(slice), sizeBytes: slice.byteLength };
    });

    const server = createNativeAssetServer({
      nativeClient: nativeClient(),
      createObjectUrl: vi.fn(),
      revokeObjectUrl: vi.fn(),
      readOutputChunk,
      chunkBytes,
    });

    const blob = await server.readFullOutput({
      outputPath: 'C:\\outputs\\small.mp4',
      mimeType: 'video/mp4',
    });

    expect(await blobBytes(blob)).toEqual(source);
    expect(readOutputChunk).toHaveBeenCalledTimes(2);
  });

  test('readFullOutput throws when chunked reads are not configured', async () => {
    const server = createNativeAssetServer({
      nativeClient: nativeClient(),
      createObjectUrl: vi.fn(),
      revokeObjectUrl: vi.fn(),
    });

    await expect(
      server.readFullOutput({ outputPath: 'C:\\outputs\\x.mp4', mimeType: 'video/mp4' }),
    ).rejects.toThrow(/not configured/i);
  });
});
