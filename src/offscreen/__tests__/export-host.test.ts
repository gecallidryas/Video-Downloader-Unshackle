import { describe, expect, test, vi } from 'vitest';
import { createOffscreenCommand } from '@/src/shared/contracts/offscreen';
import { createBrowserHlsExportHost } from '../export-host';

describe('browser HLS offscreen export host', () => {
  test('fails failed MP4 transmux with structured diagnostics instead of delivering a file', async () => {
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

    await expect(
      host.handleCommand(
        createOffscreenCommand('PING_BROWSER_HLS_EXPORT', {
          jobId: 'job-1',
        }),
      ),
    ).resolves.toMatchObject({
      ok: true,
      command: 'PING_BROWSER_HLS_EXPORT',
      bytesWritten: 0,
    });

    await host.handleCommand(
      createOffscreenCommand('APPEND_BROWSER_HLS_SEGMENT', {
        jobId: 'job-1',
        segment: {
          id: 'seg-1',
          index: 1,
          url: 'https://cdn.example.com/seg-1.ts',
        },
        bytes: new TextEncoder().encode('not transport stream'),
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
      error: expect.stringContaining('restricted to playable MP4 output'),
    });

    expect(download).not.toHaveBeenCalled();
  });

  test('records a mux failure on append and fails finalize without writing a download', async () => {
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
          bytes: new TextEncoder().encode('not transport stream'),
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
      error: expect.stringContaining('restricted to playable MP4 output'),
    });
  });

  test('transmuxes real MPEG-TS into a structurally valid MP4 download', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const segment = new Uint8Array(
      readFileSync(
        resolve(__dirname, '../../../node_modules/mux.js/test/segments/test-segment.ts'),
      ),
    );
    const download = vi.fn().mockResolvedValue(7);
    const host = createBrowserHlsExportHost({
      createObjectUrl: vi.fn().mockReturnValue('blob:mp4'),
      revokeObjectUrl: vi.fn(),
      download,
    });

    await host.handleCommand(
      createOffscreenCommand('START_BROWSER_HLS_EXPORT', {
        jobId: 'job-ok',
        route: 'hls-ts-streaming-mp4',
        outputName: 'video.mp4',
        mimeType: 'video/mp4',
        sinkKind: 'blob-memory',
        rawFallbackAllowed: false,
      }),
    );

    await host.handleCommand(
      createOffscreenCommand('APPEND_BROWSER_HLS_SEGMENT', {
        jobId: 'job-ok',
        segment: { id: 'seg-1', index: 0, url: 'https://cdn.example.com/seg-1.ts' },
        bytes: segment,
        isInitSegment: false,
      }),
    );

    await expect(
      host.handleCommand(
        createOffscreenCommand('FINALIZE_BROWSER_HLS_EXPORT', {
          jobId: 'job-ok',
        }),
      ),
    ).resolves.toMatchObject({
      ok: true,
      command: 'FINALIZE_BROWSER_HLS_EXPORT',
      output: {
        fileName: 'video.mp4',
        mimeType: 'video/mp4',
      },
    });
  });
});
