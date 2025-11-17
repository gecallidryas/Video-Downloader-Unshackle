import type {
  DownloadJob,
  JobOutput,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import type { DefaultQualityPolicy } from '@/src/background/settings/settings-store';
import type { ChromeDownload } from '@/src/core/export/downloads-export';
import {
  exportBlobDownload,
  joinSegmentsToBlob,
  rawSegmentOutputName,
} from '@/src/core/export/downloads-export';
import type { ParsedHlsManifest } from '@/src/core/hls/parse-hls-manifest';
import { runHlsJob } from '@/src/core/hls/run-hls-job';

export type FetchBrowserBytes = (
  url: string,
  init: RequestInit,
) => Promise<Uint8Array>;

export interface RunBrowserHlsExportJobInput {
  candidate: MediaCandidate;
  job: DownloadJob;
  manifest: ParsedHlsManifest;
  download?: ChromeDownload;
  fetchBytes?: FetchBrowserBytes;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  segmentTimeoutMs?: number;
  qualityPolicy?: DefaultQualityPolicy;
  signal?: AbortSignal;
}

function isBlockedProtection(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'unknown' ||
    candidate.protection.kind === 'sample-aes'
  );
}

async function defaultFetchBytes(
  url: string,
  init: RequestInit,
): Promise<Uint8Array> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`HLS fetch failed: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

function requestInitFromScheduler(request: {
  headers: Record<string, string>;
  signal?: AbortSignal;
}): RequestInit {
  return {
    cache: 'no-store',
    credentials: 'include',
    headers: request.headers,
    signal: request.signal,
  };
}

export async function runBrowserHlsExportJob(
  input: RunBrowserHlsExportJobInput,
): Promise<JobOutput> {
  if (isBlockedProtection(input.candidate)) {
    throw new Error('Protected HLS media cannot be exported by the browser runner.');
  }

  const fetchBytes = input.fetchBytes ?? defaultFetchBytes;

  return runHlsJob({
    job: input.job,
    manifest: input.manifest,
    allowProtected: input.allowProtected,
    concurrency: input.concurrency,
    maxConcurrentPerHost: input.maxConcurrentPerHost,
    segmentTimeoutMs: input.segmentTimeoutMs,
    qualityPolicy: input.qualityPolicy,
    signal: input.signal,
    fetchSegment: (segment, _plan, request) =>
      fetchBytes(segment.url, requestInitFromScheduler(request)),
    fetchKey: (keyUri, request) =>
      fetchBytes(keyUri, requestInitFromScheduler(request)),
    writeOutput: async (_plan, parts) => {
      const mimeType = 'video/mp2t';
      const blob = joinSegmentsToBlob(parts, mimeType);

      return exportBlobDownload({
        blob,
        filename: rawSegmentOutputName({
          displayName: input.candidate.displayName,
          protocol: 'hls',
        }),
        mimeType,
        saveAs: input.job.selection.saveAs,
        createObjectUrl: input.createObjectUrl,
        revokeObjectUrl: input.revokeObjectUrl,
        download: input.download,
      });
    },
  });
}
