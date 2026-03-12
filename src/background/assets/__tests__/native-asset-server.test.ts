import { describe, expect, test, vi } from 'vitest';
import { createNativeAssetServer } from '../native-asset-server';
import type { NativeFfmpegClient } from '@/src/native/native-ffmpeg-client';

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
});
