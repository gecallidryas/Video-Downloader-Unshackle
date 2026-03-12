import { describe, expect, test, vi } from 'vitest';
import { createOffscreenCommand } from '@/src/shared/contracts/offscreen';
import { createBrowserHlsExportHost } from '../export-host';

function toBase64(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

describe('browser HLS offscreen export host', () => {
  test('fails failed MP4 transmux instead of returning raw TS as a download', async () => {
    const download = vi.fn().mockResolvedValue(42);
    const host = createBrowserHlsExportHost({
      createObjectUrl: vi.fn().mockReturnValue('blob:raw-ts'),
      download,
    });

    await host.handleCommand(
      createOffscreenCommand('START_BROWSER_HLS_EXPORT', {
        jobId: 'job-1',
        route: 'hls-ts-streaming-mp4',
        outputName: 'video.mp4',
        mimeType: 'video/mp4',
        sinkKind: 'blob-memory',
        rawFallbackAllowed: true,
      }),
    );
    await host.handleCommand(
      createOffscreenCommand('APPEND_BROWSER_HLS_SEGMENT', {
        jobId: 'job-1',
        segment: {
          id: 'seg-1',
          index: 1,
          url: 'https://cdn.example.com/seg-1.ts',
        },
        bytesBase64: toBase64(new TextEncoder().encode('not transport stream')),
        isInitSegment: false,
      }),
    );

    await expect(
      host.handleCommand(
        createOffscreenCommand('FINALIZE_BROWSER_HLS_EXPORT', {
          jobId: 'job-1',
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      diagnostics: [
        {
          kind: 'mux-failure',
          route: 'hls-ts-streaming-mp4',
          sinkKind: 'blob-memory',
          phase: 'append',
          muxErrorCode: 'UNSUPPORTED_SEGMENT_FORMAT',
          segmentIndex: 1,
          segmentUrl: 'https://cdn.example.com/seg-1.ts',
          segmentBytes: 20,
          firstBytesHex: '6e 6f 74 20 74 72 61 6e',
          hasTsSyncByteAt0: false,
        },
      ],
      error: expect.stringContaining('downloads are restricted to playable MP4 output'),
    });
  });

  test('keeps explicit MP4 jobs failed while preserving raw recovery when fallback is disabled', async () => {
    const host = createBrowserHlsExportHost({
      createObjectUrl: vi.fn().mockReturnValue('blob:raw-ts'),
      download: vi.fn().mockResolvedValue(42),
    });

    await host.handleCommand(
      createOffscreenCommand('START_BROWSER_HLS_EXPORT', {
        jobId: 'job-1',
        route: 'hls-ts-streaming-mp4',
        outputName: 'video.mp4',
        mimeType: 'video/mp4',
        sinkKind: 'blob-memory',
        rawFallbackAllowed: false,
      }),
    );

    await expect(
      host.handleCommand(
        createOffscreenCommand('APPEND_BROWSER_HLS_SEGMENT', {
          jobId: 'job-1',
          segment: {
            id: 'seg-1',
            index: 1,
            url: 'https://cdn.example.com/seg-1.ts',
          },
          bytesBase64: toBase64(new TextEncoder().encode('not transport stream')),
          isInitSegment: false,
        }),
      ),
    ).resolves.toMatchObject({
      ok: true,
      diagnostics: [
        {
          segmentUrl: 'https://cdn.example.com/seg-1.ts',
          segmentBytes: 20,
          rawFallbackAllowed: false,
        },
      ],
    });

    await expect(
      host.handleCommand(
        createOffscreenCommand('FINALIZE_BROWSER_HLS_EXPORT', {
          jobId: 'job-1',
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('downloads are restricted to playable MP4 output'),
    });
  });
});
