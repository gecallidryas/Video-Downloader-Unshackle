export interface RetryPolicy {
  attempts: number;
  delayMs?: number;
}

export const RETRY_BASE_DELAY_MS = 500;
export const RETRY_JITTER_MS = 300;
export const RETRY_MAX_DELAY_MS = 15_000;

export function normalizeRetryAttempts(attempts: number | undefined): number {
  return Math.max(1, Math.floor(Number(attempts) || 3));
}

export function computeBackoffDelay(attempt: number): number {
  return Math.min(
    RETRY_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * RETRY_JITTER_MS),
    RETRY_MAX_DELAY_MS,
  );
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
