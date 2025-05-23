import type { ProtectionInfo, SegmentDescriptor } from '@/video_downloader_types_skeleton';
import { decryptAes128Segment } from '@/src/core/hls/decrypt-aes128-segment';
import { createBandwidthLimiter } from './bandwidth-limiter';
import {
  isNonRetryableError,
  partialContentFromError,
  SegmentFetchError,
} from './error-classification';
import type { SegmentProgressCallback } from './progress-events';
import {
  computeBackoffDelay,
  isAbortError,
  normalizeRetryAttempts,
} from './retry-policy';

export interface SegmentFetchRequest {
  headers: Record<string, string>;
  signal?: AbortSignal;
}

export type FetchScheduledSegment = (
  segment: SegmentDescriptor,
  request: SegmentFetchRequest,
) => Promise<Uint8Array>;

export interface SegmentSchedulerStorage {
  createBucket(jobId: string): Promise<void>;
  listFragmentIndices(jobId: string): Promise<number[]>;
  writeFragment(jobId: string, index: number, data: Uint8Array): Promise<void>;
}

export interface ScheduleSegmentsOptions {
  jobId?: string;
  segments: SegmentDescriptor[];
  concurrency?: number;
  maxConcurrentPerHost?: number;
  bandwidthBytesPerSecond?: number;
  fetchAttempts?: number;
  fetchSegment?: FetchScheduledSegment;
  fetchKey?: (keyUri: string, request: SegmentFetchRequest) => Promise<Uint8Array>;
  storage?: SegmentSchedulerStorage;
  signal?: AbortSignal;
  segmentTimeoutMs?: number;
  onProgress?: SegmentProgressCallback;
}

const DEFAULT_SEGMENT_TIMEOUT_MS = 30_000;

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

function rangeHeaders(segment: SegmentDescriptor): Record<string, string> {
  return segment.byteRange
    ? { Range: `bytes=${segment.byteRange.start}-${segment.byteRange.end}` }
    : {};
}

function resumeRangeHeaders(
  segment: SegmentDescriptor,
  resumeOffset: number,
): Record<string, string> {
  if (resumeOffset <= 0) {
    return rangeHeaders(segment);
  }

  if (segment.byteRange) {
    return {
      Range: `bytes=${segment.byteRange.start + resumeOffset}-${segment.byteRange.end}`,
    };
  }

  return { Range: `bytes=${resumeOffset}-` };
}

function joinParts(parts: Uint8Array[]): Uint8Array {
  const totalBytes = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(totalBytes);
  let offset = 0;

  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }

  return joined;
}

async function defaultFetchSegment(
  segment: SegmentDescriptor,
  request: SegmentFetchRequest,
): Promise<Uint8Array> {
  const response = await fetch(segment.url, {
    cache: 'no-store',
    headers: request.headers,
    signal: request.signal,
  });

  if (!response.ok) {
    throw new SegmentFetchError(response.status, response.statusText);
  }

  return new Uint8Array(await response.arrayBuffer());
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error('Segment download cancelled.');
  }
}

async function retryWithBackoff<T>(
  attempts: number,
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw error;
      }

      if (isNonRetryableError(error)) {
        throw error;
      }

      lastError = error;
      if (attempt < attempts - 1) {
        const delay = computeBackoffDelay(attempt);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delay);
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(
                signal.reason ?? new DOMException('Aborted', 'AbortError'),
              );
            },
            { once: true },
          );
        });
      }
    }
  }

  throw lastError;
}

function composeSegmentSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('Segment fetch timed out.', 'AbortError'));
  }, timeoutMs);

  const abortFromParent = () => {
    controller.abort(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
  };

  if (signal?.aborted) {
    abortFromParent();
  } else {
    signal?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromParent);
    },
  };
}

async function decryptIfNeeded(
  segment: SegmentDescriptor,
  data: Uint8Array,
  options: ScheduleSegmentsOptions,
): Promise<Uint8Array> {
  if (!segment.encryption?.keyUri) {
    return data;
  }

  if (!options.fetchKey) {
    throw new Error(`Missing AES-128 key fetcher for segment: ${segment.id}`);
  }

  const key = await options.fetchKey(segment.encryption.keyUri, {
    headers: {},
    signal: options.signal,
  });
  const protection: ProtectionInfo = {
    kind:
      segment.encryption.method?.toUpperCase() === 'AES-128'
        ? 'aes-128'
        : 'unknown',
    method: segment.encryption.method,
    keyUri: segment.encryption.keyUri,
    iv: segment.encryption.iv,
  };

  return decryptAes128Segment({
    encrypted: data,
    key,
    iv: segment.encryption.iv,
    mediaSequence: segment.index,
    protection,
  });
}

async function fetchSegmentWithRecovery(
  segment: SegmentDescriptor,
  options: ScheduleSegmentsOptions,
  fetchSegment: FetchScheduledSegment,
  attempts: number,
  segmentTimeoutMs: number,
  onHostRecoverableFailure: () => void,
): Promise<Uint8Array> {
  let resumeOffset = 0;
  const recoveredParts: Uint8Array[] = [];

  const data = await retryWithBackoff(
    attempts,
    async () => {
      const segmentSignal = composeSegmentSignal(options.signal, segmentTimeoutMs);

      try {
        return await fetchSegment(segment, {
          headers: resumeRangeHeaders(segment, resumeOffset),
          signal: segmentSignal.signal,
        });
      } catch (error) {
        const partial = partialContentFromError(error);

        if (partial && !options.signal?.aborted) {
          resumeOffset += partial.partialBytes;
          onHostRecoverableFailure();

          if (partial.partialData) {
            recoveredParts.push(partial.partialData);
          }
        }

        throw error;
      } finally {
        segmentSignal.dispose();
      }
    },
    options.signal,
  );

  return recoveredParts.length > 0 ? joinParts([...recoveredParts, data]) : data;
}

export async function scheduleSegments(
  options: ScheduleSegmentsOptions,
): Promise<Uint8Array[]> {
  const fetchSegment = options.fetchSegment ?? defaultFetchSegment;
  const attempts = normalizeRetryAttempts(options.fetchAttempts);
  const globalLimit = Math.max(1, Math.floor(options.concurrency ?? 1));
  const hostLimit = Math.max(1, Math.floor(options.maxConcurrentPerHost ?? globalLimit));
  const segmentTimeoutMs = Math.max(
    1,
    Math.floor(options.segmentTimeoutMs ?? DEFAULT_SEGMENT_TIMEOUT_MS),
  );
  const limiter = createBandwidthLimiter(options.bandwidthBytesPerSecond);
  const results = new Array<Uint8Array | undefined>(options.segments.length);
  const queue: SegmentDescriptor[] = [];
  const activeByHost = new Map<string, number>();
  const recoverableFailuresByHost = new Map<string, number>();
  const effectiveHostLimit = (host: string) =>
    (recoverableFailuresByHost.get(host) ?? 0) >= 2 ? 1 : hostLimit;
  let downloaded = 0;
  let failed = 0;

  if (options.storage && options.jobId) {
    await options.storage.createBucket(options.jobId);
    const existing = new Set(
      (await options.storage.listFragmentIndices(options.jobId)).map(Number),
    );

    for (const segment of options.segments) {
      if (existing.has(segment.index)) {
        downloaded += 1;
        continue;
      }

      queue.push(segment);
    }
  } else {
    queue.push(...options.segments);
  }

  options.onProgress?.({ downloaded, failed, total: options.segments.length });

  async function nextSegment(): Promise<SegmentDescriptor | undefined> {
    while (queue.length > 0) {
      throwIfAborted(options.signal);
      const queueIndex = queue.findIndex((candidate) => {
        const host = hostFromUrl(candidate.url);

        return (activeByHost.get(host) ?? 0) < effectiveHostLimit(host);
      });

      if (queueIndex === -1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        continue;
      }

      const [segment] = queue.splice(queueIndex, 1);
      if (!segment) {
        return undefined;
      }
      const host = hostFromUrl(segment.url);
      activeByHost.set(host, (activeByHost.get(host) ?? 0) + 1);

      return segment;
    }

    return undefined;
  }

  async function worker(): Promise<void> {
    while (true) {
      const segment = await nextSegment();

      if (!segment) {
        return;
      }

      const host = hostFromUrl(segment.url);
      let bytes = 0;

      try {
        throwIfAborted(options.signal);
        const data = await fetchSegmentWithRecovery(
          segment,
          options,
          fetchSegment,
          attempts,
          segmentTimeoutMs,
          () => {
            recoverableFailuresByHost.set(
              host,
              (recoverableFailuresByHost.get(host) ?? 0) + 1,
            );
          },
        );
        const finalData = await decryptIfNeeded(segment, data, options);
        bytes = finalData.byteLength;
        results[segment.index] = finalData;

        if (options.storage && options.jobId) {
          await options.storage.writeFragment(options.jobId, segment.index, finalData);
        }

        downloaded += 1;
        options.onProgress?.({
          downloaded,
          failed,
          total: options.segments.length,
          segment,
        });
        throwIfAborted(options.signal);
      } catch (error) {
        if (options.signal?.aborted) {
          throw new Error('Segment download cancelled.');
        }

        failed += 1;
        options.onProgress?.({
          downloaded,
          failed,
          total: options.segments.length,
          segment,
        });
        throw error;
      } finally {
        try {
          await limiter.throttle(bytes);
        } finally {
          const nextCount = (activeByHost.get(host) ?? 1) - 1;

          if (nextCount <= 0) {
            activeByHost.delete(host);
          } else {
            activeByHost.set(host, nextCount);
          }
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(globalLimit, Math.max(queue.length, 1)) }, () =>
      worker(),
    ),
  );

  return results.filter((part): part is Uint8Array => part !== undefined);
}
