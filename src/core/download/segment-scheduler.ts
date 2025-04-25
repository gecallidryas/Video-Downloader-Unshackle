import type { ProtectionInfo, SegmentDescriptor } from '@/video_downloader_types_skeleton';
import { decryptAes128Segment } from '@/src/core/hls/decrypt-aes128-segment';
import { createBandwidthLimiter } from './bandwidth-limiter';
import type { SegmentProgressCallback } from './progress-events';
import {
  normalizeRetryAttempts,
  RETRY_BASE_DELAY_MS,
  RETRY_JITTER_MS,
  RETRY_MAX_DELAY_MS,
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
  onProgress?: SegmentProgressCallback;
}

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
    throw new Error(`Failed to fetch segment ${segment.index}: ${response.status}`);
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
      lastError = error;
      if (attempt < attempts - 1) {
        const delay = Math.min(
          RETRY_BASE_DELAY_MS * 2 ** attempt +
            Math.floor(Math.random() * RETRY_JITTER_MS),
          RETRY_MAX_DELAY_MS,
        );
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

export async function scheduleSegments(
  options: ScheduleSegmentsOptions,
): Promise<Uint8Array[]> {
  const fetchSegment = options.fetchSegment ?? defaultFetchSegment;
  const attempts = normalizeRetryAttempts(options.fetchAttempts);
  const globalLimit = Math.max(1, Math.floor(options.concurrency ?? 1));
  const hostLimit = Math.max(1, Math.floor(options.maxConcurrentPerHost ?? globalLimit));
  const limiter = createBandwidthLimiter(options.bandwidthBytesPerSecond);
  const results = new Array<Uint8Array | undefined>(options.segments.length);
  const queue: SegmentDescriptor[] = [];
  const activeByHost = new Map<string, number>();
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

        return (activeByHost.get(host) ?? 0) < hostLimit;
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
        const data = await retryWithBackoff(
          attempts,
          async () =>
            fetchSegment(segment, {
              headers: rangeHeaders(segment),
              signal: options.signal,
            }),
          options.signal,
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
