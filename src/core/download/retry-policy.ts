export interface RetryPolicy {
  attempts: number;
  delayMs?: number;
}

export const RETRY_BASE_DELAY_MS = 500;
export const RETRY_JITTER_MS = 300;
export const RETRY_MAX_DELAY_MS = 15_000;
export const RETRY_AFTER_MAX_DELAY_MS = 60_000;
export const DEFAULT_RETRY_ATTEMPTS = 5;

export function normalizeRetryAttempts(attempts: number | undefined): number {
  return Math.max(1, Math.floor(Number(attempts) || DEFAULT_RETRY_ATTEMPTS));
}

export function computeBackoffDelay(attempt: number, retryAfterMs?: number): number {
  const computed = Math.min(
    RETRY_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * RETRY_JITTER_MS),
    RETRY_MAX_DELAY_MS,
  );

  if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return Math.min(Math.max(computed, retryAfterMs), RETRY_AFTER_MAX_DELAY_MS);
  }

  return computed;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
