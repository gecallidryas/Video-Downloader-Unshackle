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
});
