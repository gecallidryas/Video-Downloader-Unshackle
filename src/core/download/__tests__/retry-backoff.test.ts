import { describe, expect, test, vi } from 'vitest';
import {
  computeBackoffDelay,
  DEFAULT_RETRY_ATTEMPTS,
  normalizeRetryAttempts,
  RETRY_AFTER_MAX_DELAY_MS,
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

  test('honors a server Retry-After delay larger than the computed backoff', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(computeBackoffDelay(0, 8_000)).toBe(8_000);
  });

  test('Retry-After may exceed the standard cap up to the Retry-After ceiling', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(computeBackoffDelay(0, 30_000)).toBe(30_000);
    expect(computeBackoffDelay(0, 120_000)).toBe(RETRY_AFTER_MAX_DELAY_MS);
  });

  test('ignores a Retry-After smaller than the computed backoff', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(computeBackoffDelay(3, 100)).toBe(RETRY_BASE_DELAY_MS * 2 ** 3);
  });
});

describe('normalizeRetryAttempts', () => {
  test('defaults to the SOTA-comparable retry count when unset', () => {
    expect(DEFAULT_RETRY_ATTEMPTS).toBe(5);
    expect(normalizeRetryAttempts(undefined)).toBe(DEFAULT_RETRY_ATTEMPTS);
    expect(normalizeRetryAttempts(0)).toBe(DEFAULT_RETRY_ATTEMPTS);
  });

  test('respects an explicit configured attempt count', () => {
    expect(normalizeRetryAttempts(10)).toBe(10);
    expect(normalizeRetryAttempts(1)).toBe(1);
  });
});
