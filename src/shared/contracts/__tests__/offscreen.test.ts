import { describe, expect, test } from 'vitest';
import {
  OFFSCREEN_COMMAND_TYPES,
  createOffscreenCommand,
  isOffscreenCommand,
} from '../offscreen';

describe('offscreen command contract', () => {
  test('declares the mux command surface', () => {
    expect(OFFSCREEN_COMMAND_TYPES).toEqual([
      'START_OPFS_MUX',
      'WRITE_SEGMENT',
      'FINALIZE_MUX_DOWNLOAD',
      'FINALIZE_MUX_DOWNLOAD_SPLIT',
      'START_MEMORY_MUX',
      'APPEND_SEGMENT_MEMORY',
      'CLEANUP_MUX_JOB',
      'START_BROWSER_HLS_EXPORT',
      'APPEND_BROWSER_HLS_SEGMENT',
      'FINALIZE_BROWSER_HLS_EXPORT',
      'PING_BROWSER_HLS_EXPORT',
      'ABORT_BROWSER_HLS_EXPORT',
    ]);
  });

  test('validates typed command envelopes', () => {
    const command = createOffscreenCommand('WRITE_SEGMENT', {
      jobId: 'job-1',
      index: 0,
      data: 'AAAA',
      trackType: 'video',
    });

    expect(isOffscreenCommand(command)).toBe(true);
    expect(isOffscreenCommand({ type: 'WRITE_SEGMENT', payload: {} })).toBe(false);
    expect(isOffscreenCommand({ type: 'UNKNOWN', payload: {} })).toBe(false);
  });

  test('validates browser HLS append messages carrying raw segment bytes', () => {
    expect(
      isOffscreenCommand(
        createOffscreenCommand('APPEND_BROWSER_HLS_SEGMENT', {
          jobId: 'job-1',
          segment: {
            id: 'segment-1',
            index: 1,
            url: 'https://cdn.example.com/segment.ts',
          },
          bytes: new Uint8Array([0x47]),
          isInitSegment: false,
        }),
      ),
    ).toBe(true);

    // A non-typed-array byte payload (e.g. a leftover base64 string) is rejected.
    expect(
      isOffscreenCommand({
        type: 'APPEND_BROWSER_HLS_SEGMENT',
        requestId: 'request-1',
        payload: {
          jobId: 'job-1',
          segment: { id: 'segment-1', index: 1 },
          bytes: 'Rw==',
          isInitSegment: false,
        },
      }),
    ).toBe(false);
  });
});
