import { describe, expect, test } from 'vitest';
import { chooseMuxStoragePolicy } from '../memory-policy';

describe('mux memory policy', () => {
  test('known large jobs choose OPFS and split output when duration is known', () => {
    expect(
      chooseMuxStoragePolicy({
        estimatedBytes: 2_000_000_000,
        durationSec: 3600,
        memoryCeilingBytes: 500_000_000,
        opfsAvailable: true,
      }),
    ).toEqual({
      mode: 'opfs',
      splitOutput: true,
      reason: 'estimated-size-exceeds-memory-ceiling',
    });
  });

  test('large jobs above ceiling fail without duration and reject memory fallback', () => {
    expect(() =>
      chooseMuxStoragePolicy({
        estimatedBytes: 2_000_000_000,
        memoryCeilingBytes: 500_000_000,
        opfsAvailable: true,
      }),
    ).toThrow('Cannot safely split a large mux job without a known duration.');

    expect(() =>
      chooseMuxStoragePolicy({
        estimatedBytes: 2_000_000_000,
        durationSec: 3600,
        memoryCeilingBytes: 500_000_000,
        opfsAvailable: false,
      }),
    ).toThrow('OPFS is unavailable and the estimated output exceeds the memory ceiling.');
  });
});
