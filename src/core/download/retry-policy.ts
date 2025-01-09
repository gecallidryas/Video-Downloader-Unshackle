export interface RetryPolicy {
  attempts: number;
  delayMs?: number;
}

export function normalizeRetryAttempts(attempts: number | undefined): number {
  return Math.max(1, Math.floor(Number(attempts) || 1));
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
