const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 405, 410, 451]);

export class SegmentFetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`Segment fetch failed: ${status} ${message}`);
    this.name = 'SegmentFetchError';
  }
}

export function isNonRetryableError(error: unknown): boolean {
  return error instanceof SegmentFetchError && NON_RETRYABLE_STATUS.has(error.status);
}
