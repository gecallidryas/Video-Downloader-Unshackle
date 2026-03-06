import { describe, expect, test, vi } from 'vitest';
import { detectStreamingWriteCapabilities } from '../streaming-write-capabilities';

describe('streaming write capability detection', () => {
  test('detects File System Access, OPFS, and WritableStream support independently', () => {
    expect(
      detectStreamingWriteCapabilities({
        showDirectoryPicker: vi.fn(),
        WritableStream: class WritableStream {},
        navigator: {
          storage: {
            getDirectory: vi.fn(),
          },
        },
      }),
    ).toMatchObject({
      fileSystemAccess: true,
      opfs: true,
      writableStream: true,
    });
  });

  test('returns false values when no streaming write APIs are present', () => {
    expect(detectStreamingWriteCapabilities({ navigator: {} })).toMatchObject({
      fileSystemAccess: false,
      opfs: false,
      writableStream: false,
    });
  });

  test('does not infer persisted output-folder permission from API presence', () => {
    expect(
      detectStreamingWriteCapabilities({
        showDirectoryPicker: vi.fn(),
        navigator: {
          storage: {
            getDirectory: vi.fn(),
          },
        },
      }).persistedOutputDirectory,
    ).toBe(false);
  });
});
