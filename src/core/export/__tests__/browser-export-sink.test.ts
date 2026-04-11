import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  BlobMemorySink,
  FileSystemAccessSink,
  OpfsStagingSink,
} from '../browser-export-sink';

interface RecordingWritable {
  writes: number[];
  largestWrite: number;
  liveBytes: number;
  stored: Uint8Array;
}

function recordingWritable(record: RecordingWritable) {
  return {
    async write(data: ArrayBuffer) {
      const chunk = new Uint8Array(data);
      record.writes.push(chunk.byteLength);
      record.largestWrite = Math.max(record.largestWrite, chunk.byteLength);
      const merged = new Uint8Array(record.stored.byteLength + chunk.byteLength);
      merged.set(record.stored);
      merged.set(chunk, record.stored.byteLength);
      record.stored = merged;
    },
    async close() {},
    async abort() {},
  };
}

function newRecord(): RecordingWritable {
  return { writes: [], largestWrite: 0, liveBytes: 0, stored: new Uint8Array(0) };
}

describe('browser export sinks', () => {
  afterEach(() => {
    if (Object.getOwnPropertyDescriptor(navigator, 'storage')?.configurable) {
      Reflect.deleteProperty(navigator as object, 'storage');
    }
  });

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

  test('streams large OPFS output to disk one chunk at a time without buffering the whole file', async () => {
    const record = newRecord();
    const fileHandle = {
      async createWritable() {
        return recordingWritable(record);
      },
      async getFile() {
        return new Blob([record.stored as unknown as BlobPart]);
      },
    };
    const directory = {
      async getDirectoryHandle() {
        return directory;
      },
      async getFileHandle() {
        return fileHandle;
      },
      async removeEntry() {},
    };
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: async () => directory },
    });

    const sink = new OpfsStagingSink({
      jobId: 'job-large',
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      createObjectUrl: vi.fn().mockReturnValue('blob:opfs-large'),
      deferDownload: true,
    });

    const chunkSize = 1024 * 1024;
    const chunkCount = 64;

    for (let i = 0; i < chunkCount; i += 1) {
      await sink.write(new Uint8Array(chunkSize));
    }

    const output = await sink.close();

    expect(record.writes.length).toBe(chunkCount);
    expect(record.largestWrite).toBe(chunkSize);
    expect(sink.bytesWritten).toBe(chunkSize * chunkCount);
    expect(output.sizeBytes).toBe(chunkSize * chunkCount);
    expect(output.opfsPath).toBe('browser-hls-export/job-large/video.mp4');
  });

  test('streams large File System Access output to disk one chunk at a time', async () => {
    const record = newRecord();
    const fileHandle = {
      async createWritable() {
        return recordingWritable(record);
      },
      async getFile() {
        return new Blob([record.stored as unknown as BlobPart]);
      },
    };
    const directoryHandle = {
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
      getFileHandle: vi.fn().mockResolvedValue(fileHandle),
      removeEntry: vi.fn().mockResolvedValue(undefined),
    };

    const sink = new FileSystemAccessSink(
      {
        jobId: 'job-fs',
        fileName: 'video.mp4',
        mimeType: 'video/mp4',
      },
      directoryHandle as never,
    );

    const chunkSize = 1024 * 1024;
    const chunkCount = 32;

    for (let i = 0; i < chunkCount; i += 1) {
      await sink.write(new Uint8Array(chunkSize));
    }

    const output = await sink.close();

    expect(record.writes.length).toBe(chunkCount);
    expect(record.largestWrite).toBe(chunkSize);
    expect(output.sizeBytes).toBe(chunkSize * chunkCount);
    expect(output.outputUrl).toBe('file-system-access://video.mp4');
  });

  test('refuses an oversized blob-memory job with the documented ceiling message', async () => {
    const sink = new BlobMemorySink({
      jobId: 'job-oversized',
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      memoryCeilingBytes: 150 * 1024 * 1024,
      createObjectUrl: vi.fn(),
      download: vi.fn(),
    });

    await sink.write(new Uint8Array(150 * 1024 * 1024));
    await expect(sink.write(new Uint8Array(1))).rejects.toThrow(
      /Browser memory export exceeded the safe limit \(157286401 bytes > 157286400 bytes\)/,
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
