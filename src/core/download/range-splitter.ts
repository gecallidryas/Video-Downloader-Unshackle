import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';
import { SegmentFetchError } from './error-classification';
import { scheduleSegments } from './segment-scheduler';

export interface RangeChunk {
  start: number;
  end: number;
}

type DirectRangeFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface DownloadDirectWithRangesOptions {
  url: string;
  chunkSizeBytes?: number;
  concurrency?: number;
  fetch?: DirectRangeFetch;
  signal?: AbortSignal;
}

const DEFAULT_DIRECT_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;

export function splitIntoRanges(totalBytes: number, chunkSize: number): RangeChunk[] {
  if (totalBytes <= 0 || chunkSize <= 0) {
    return [];
  }

  const chunks: RangeChunk[] = [];

  for (let start = 0; start < totalBytes; start += chunkSize) {
    chunks.push({ start, end: Math.min(start + chunkSize - 1, totalBytes - 1) });
  }

  return chunks;
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

async function responseBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

export async function downloadDirectWithRanges(
  options: DownloadDirectWithRangesOptions,
): Promise<Uint8Array> {
  const fetcher = options.fetch ?? fetch;
  const head = await fetcher(options.url, {
    method: 'HEAD',
    signal: options.signal,
  });

  if (!head.ok) {
    throw new SegmentFetchError(head.status, head.statusText);
  }

  const totalBytes = Number(head.headers.get('Content-Length'));
  const acceptsRanges = head.headers.get('Accept-Ranges')?.toLowerCase() === 'bytes';
  const chunkSizeBytes = Math.max(
    1,
    Math.floor(options.chunkSizeBytes ?? DEFAULT_DIRECT_CHUNK_SIZE_BYTES),
  );

  if (!acceptsRanges || !Number.isFinite(totalBytes) || totalBytes <= chunkSizeBytes) {
    const response = await fetcher(options.url, { signal: options.signal });

    if (!response.ok) {
      throw new SegmentFetchError(response.status, response.statusText);
    }

    return responseBytes(response);
  }

  const segments: SegmentDescriptor[] = splitIntoRanges(totalBytes, chunkSizeBytes).map(
    (range, index) => ({
      id: `direct-range-${index}`,
      index,
      url: options.url,
      byteRange: range,
    }),
  );

  const parts = await scheduleSegments({
    segments,
    concurrency: options.concurrency ?? 3,
    signal: options.signal,
    fetchSegment: async (segment, request) => {
      const response = await fetcher(segment.url, {
        headers: request.headers,
        signal: request.signal,
      });

      if (response.status !== 206) {
        throw new SegmentFetchError(response.status, response.statusText);
      }

      return responseBytes(response);
    },
  });

  return joinParts(parts);
}
