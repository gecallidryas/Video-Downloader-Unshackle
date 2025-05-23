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

export interface PartialContentError {
  partialBytes: number;
  partialData?: Uint8Array;
}

export function partialContentFromError(error: unknown): PartialContentError | undefined {
  if (typeof error !== 'object' || error === null || !('partialBytes' in error)) {
    return undefined;
  }

  const partialBytes = Number((error as { partialBytes: unknown }).partialBytes);

  if (!Number.isFinite(partialBytes) || partialBytes <= 0) {
    return undefined;
  }

  const partialData = (error as { partialData?: unknown }).partialData;

  return {
    partialBytes,
    partialData: partialData instanceof Uint8Array ? partialData : undefined,
  };
}

export function isPartialContentError(error: unknown): boolean {
  return partialContentFromError(error) !== undefined;
}
