import { describe, expect, test, vi } from 'vitest';
import { BlobMemorySink } from '../browser-export-sink';

describe('browser export sinks', () => {
  test('writes blob-memory chunks in order and reports output metadata', async () => {
    const download = vi.fn().mockResolvedValue(42);
    const sink = new BlobMemorySink({
      jobId: 'job-1',
      fileName: 'video.ts',
      mimeType: 'video/mp2t',
      createObjectUrl: vi.fn().mockReturnValue('blob:video-ts'),
      download,
    });

    await sink.write(new Uint8Array([1, 2]));
    await sink.write(new Uint8Array([3]));

    await expect(sink.close()).resolves.toMatchObject({
      fileName: 'video.ts',
      mimeType: 'video/mp2t',
      outputUrl: 'blob:video-ts',
      downloadId: 42,
      sizeBytes: 3,
    });
    expect(sink.bytesWritten).toBe(3);
    expect(download).toHaveBeenCalledWith({
      url: 'blob:video-ts',
      filename: 'video.ts',
      saveAs: false,
    });
  });

  test('refuses blob-memory writes before exceeding the configured ceiling', async () => {
    const sink = new BlobMemorySink({
      jobId: 'job-1',
      fileName: 'video.ts',
      mimeType: 'video/mp2t',
      memoryCeilingBytes: 2,
      createObjectUrl: vi.fn(),
      download: vi.fn(),
    });

    await sink.write(new Uint8Array([1, 2]));
    await expect(sink.write(new Uint8Array([3]))).rejects.toThrow(
      'Browser memory export exceeded the safe limit',
    );
  });

  test('aborts blob-memory output without leaving writable bytes', async () => {
    const sink = new BlobMemorySink({
      jobId: 'job-1',
      fileName: 'video.ts',
      mimeType: 'video/mp2t',
      createObjectUrl: vi.fn(),
      download: vi.fn(),
    });

    await sink.write(new Uint8Array([1, 2]));
    await sink.abort('cancelled');

    expect(sink.bytesWritten).toBe(0);
    await expect(sink.write(new Uint8Array([3]))).rejects.toThrow(
      'Cannot write to a closed browser export sink',
    );
  });
});
