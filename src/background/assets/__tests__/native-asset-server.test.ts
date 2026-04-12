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

  test('readFullOutput does not treat a short non-final chunk as eof', async () => {
    const chunkBytes = 4;
    // The helper hands back a short chunk in the middle of the file (e.g. a
    // partial read) before more data follows. The loop must keep reading until
    // the authoritative eof flag, not stop at the first short read.
    const responses = [
      { base64: bytesToBase64(new Uint8Array([1, 2])), sizeBytes: 2, eof: false },
      { base64: bytesToBase64(new Uint8Array([3, 4, 5, 6])), sizeBytes: 4, eof: false },
      { base64: bytesToBase64(new Uint8Array([7])), sizeBytes: 1, eof: true },
    ];
    const readOutputChunk = vi.fn(async () => responses.shift()!);

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

    expect(await blobBytes(blob)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7]));
    expect(readOutputChunk).toHaveBeenCalledTimes(3);
  });

  test('readFullOutput streams chunks through an injected sink and finalizes once', async () => {
    const chunkBytes = 4;
    const source = new Uint8Array([10, 11, 12, 13, 20, 21]);
    const readOutputChunk = vi.fn(async ({ offset, length }: { offset: number; length: number }) => {
      const slice = source.subarray(offset, offset + length);
      return {
        base64: bytesToBase64(slice),
        sizeBytes: slice.byteLength,
        eof: offset + slice.byteLength >= source.byteLength,
      };
    });

    const written: Uint8Array[] = [];
    let finalizeCount = 0;
    const createOutputSink = vi.fn(async ({ mimeType }: { mimeType: string }) => ({
      async write(chunk: Uint8Array) {
        written.push(chunk.slice());
      },
      async finalize() {
        finalizeCount += 1;
        const merged = new Uint8Array(written.reduce((n, c) => n + c.byteLength, 0));
        let pos = 0;
        for (const part of written) {
          merged.set(part, pos);
          pos += part.byteLength;
        }
        return new Blob([merged], { type: mimeType });
      },
    }));

    const server = createNativeAssetServer({
      nativeClient: nativeClient(),
      createObjectUrl: vi.fn(),
      revokeObjectUrl: vi.fn(),
      readOutputChunk,
      chunkBytes,
      createOutputSink,
    });

    const blob = await server.readFullOutput({
      outputPath: 'C:\\outputs\\stream.mp4',
      mimeType: 'video/mp4',
      totalBytes: source.byteLength,
    });

    expect(createOutputSink).toHaveBeenCalledTimes(1);
    // Each non-empty chunk is written incrementally rather than buffered as one blob.
    expect(written.map((c) => Array.from(c))).toEqual([
      [10, 11, 12, 13],
      [20, 21],
    ]);
    expect(finalizeCount).toBe(1);
    expect(await blobBytes(blob)).toEqual(source);
    expect(blob.type).toBe('video/mp4');
  });

  test('readFullOutput falls back to in-memory accumulation when no sink or OPFS is available', async () => {
    const chunkBytes = 4;
    const source = new Uint8Array([1, 2, 3, 4, 5]);
    const readOutputChunk = vi.fn(async ({ offset, length }: { offset: number; length: number }) => {
      const slice = source.subarray(offset, offset + length);
      return {
        base64: bytesToBase64(slice),
        sizeBytes: slice.byteLength,
        eof: offset + slice.byteLength >= source.byteLength,
      };
    });

    // No createOutputSink injected and no OPFS in the test runtime → default
    // factory must produce a working in-memory sink.
    const server = createNativeAssetServer({
      nativeClient: nativeClient(),
      createObjectUrl: vi.fn(),
      revokeObjectUrl: vi.fn(),
      readOutputChunk,
      chunkBytes,
    });

    const blob = await server.readFullOutput({
      outputPath: 'C:\\outputs\\fallback.mp4',
      mimeType: 'video/mp4',
      totalBytes: source.byteLength,
    });

    expect(await blobBytes(blob)).toEqual(source);
    expect(blob.type).toBe('video/mp4');
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
