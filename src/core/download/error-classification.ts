const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 405, 410, 451]);

export class SegmentFetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterMs?: number,
    public readonly nonRetryable?: boolean,
  ) {
    super(`Segment fetch failed: ${status} ${message}`);
    this.name = 'SegmentFetchError';
  }
}

export function parseRetryAfter(
  headerValue: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (headerValue === null || headerValue === undefined) {
    return undefined;
  }

  const trimmed = headerValue.trim();

  if (trimmed === '') {
    return undefined;
  }

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);

    return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : undefined;
  }

  const dateMs = Date.parse(trimmed);

  if (Number.isNaN(dateMs)) {
    return undefined;
  }

  return Math.max(0, dateMs - now);
}

export function retryAfterFromError(error: unknown): number | undefined {
  if (error instanceof SegmentFetchError && typeof error.retryAfterMs === 'number') {
    return error.retryAfterMs;
  }

  return undefined;
}

export function isNonRetryableError(error: unknown): boolean {
  return (
    error instanceof SegmentFetchError &&
    (error.nonRetryable === true || NON_RETRYABLE_STATUS.has(error.status))
  );
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

  if (!(partialData instanceof Uint8Array) || partialData.byteLength !== partialBytes) {
    return undefined;
  }

  return {
    partialBytes,
    partialData,
  };
}

export function isPartialContentError(error: unknown): boolean {
  return partialContentFromError(error) !== undefined;
}
