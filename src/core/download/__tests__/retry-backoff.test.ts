import { describe, expect, test, vi } from 'vitest';
import {
  computeBackoffDelay,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} from '../retry-policy';

describe('computeBackoffDelay', () => {
  test('attempt 0 returns base delay plus jitter', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const delay = computeBackoffDelay(0);

    expect(delay).toBeGreaterThanOrEqual(RETRY_BASE_DELAY_MS);
    expect(delay).toBeLessThanOrEqual(RETRY_BASE_DELAY_MS + 300);
  });

  test('delay is capped at the maximum retry delay', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    expect(computeBackoffDelay(20)).toBe(RETRY_MAX_DELAY_MS);
  });
});
