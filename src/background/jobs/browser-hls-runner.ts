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
import {
  parseHlsManifest,
  type ParsedHlsManifest,
} from '@/src/core/hls/parse-hls-manifest';
import { runHlsJob } from '@/src/core/hls/run-hls-job';
import type { SegmentProgressCallback } from '@/src/core/download/progress-events';
import { selectHlsVariant } from '@/src/core/hls/select-hls-variant';
import {
  transmuxTsToMp4,
  type MuxjsTransmuxResult,
} from '@/src/core/export/muxjs-transmuxer';

export type FetchBrowserBytes = (
  url: string,
  init: RequestInit,
) => Promise<Uint8Array>;

export type FetchBrowserText = (
  url: string,
  init: RequestInit,
) => Promise<string>;

export interface RunBrowserHlsExportJobInput {
  candidate: MediaCandidate;
  job: DownloadJob;
  manifest: ParsedHlsManifest;
  download?: ChromeDownload;
  writeFile?: (filename: string, data: Uint8Array) => Promise<void>;
  fetchBytes?: FetchBrowserBytes;
  fetchText?: FetchBrowserText;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  segmentTimeoutMs?: number;
  qualityPolicy?: DefaultQualityPolicy;
  onPlan?: Parameters<typeof runHlsJob>[0]['onPlan'];
  onProgress?: SegmentProgressCallback;
  browserTransmuxWithMuxJs?: boolean;
  browserTransmuxMaxBytes?: number;
  transmuxTsToMp4?: (input: { segments: Uint8Array[] }) => Promise<MuxjsTransmuxResult>;
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

async function defaultFetchText(
  url: string,
  init: RequestInit,
): Promise<string> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`HLS playlist fetch failed: ${response.status}`);
  }

  return response.text();
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

function totalBytes(parts: Uint8Array[]): number {
  return parts.reduce((sum, part) => sum + part.byteLength, 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unsupported stream';
}

async function resolveMediaPlaylist(
  input: RunBrowserHlsExportJobInput,
): Promise<ParsedHlsManifest> {
  if (input.manifest.playlistKind === 'media') {
    return input.manifest;
  }

  const selected = selectHlsVariant(input.manifest, input.job.selection, {
    qualityPolicy: input.qualityPolicy,
  });

  if (!selected.url) {
    throw new Error('Selected HLS variant is missing a media playlist URL.');
  }

  const fetchText = input.fetchText ?? defaultFetchText;
  const content = await fetchText(selected.url, {
    cache: 'no-store',
    credentials: 'include',
    signal: input.signal,
  });

  return parseHlsManifest({
    manifestUrl: selected.url,
    content,
  });
}

export async function runBrowserHlsExportJob(
  input: RunBrowserHlsExportJobInput,
): Promise<JobOutput> {
  if (isBlockedProtection(input.candidate)) {
    throw new Error('Protected HLS media cannot be exported by the browser runner.');
  }

  const fetchBytes = input.fetchBytes ?? defaultFetchBytes;
  const mediaManifest = await resolveMediaPlaylist(input);

  return runHlsJob({
    job: input.job,
    manifest: mediaManifest,
    allowProtected: input.allowProtected,
    concurrency: input.concurrency,
    maxConcurrentPerHost: input.maxConcurrentPerHost,
    segmentTimeoutMs: input.segmentTimeoutMs,
    qualityPolicy: input.qualityPolicy,
    onPlan: input.onPlan,
    onProgress: input.onProgress,
    signal: input.signal,
    fetchSegment: (segment, _plan, request) =>
      fetchBytes(segment.url, requestInitFromScheduler(request)),
    fetchKey: (keyUri, request) =>
      fetchBytes(keyUri, requestInitFromScheduler(request)),
    writeOutput: async (_plan, parts) => {
      const maxTransmuxBytes = input.browserTransmuxMaxBytes ?? 150 * 1024 * 1024;

      if (input.browserTransmuxWithMuxJs && totalBytes(parts) <= maxTransmuxBytes) {
        try {
          const transmux = input.transmuxTsToMp4 ?? transmuxTsToMp4;
          const result = await transmux({ segments: parts });
          const output = await exportBlobDownload({
            blob: joinSegmentsToBlob([result.bytes], result.mimeType),
            filename: rawSegmentOutputName({
              displayName: input.candidate.displayName,
              protocol: 'hls',
              extension: 'mp4',
            }),
            mimeType: result.mimeType,
            saveAs: input.job.selection.saveAs,
            writeFile: input.writeFile,
            createObjectUrl: input.createObjectUrl,
            revokeObjectUrl: input.revokeObjectUrl,
            download: input.download,
          });

          return {
            ...output,
            notes: ['Browser transmuxed MPEG-TS HLS segments to MP4 with mux.js.'],
          };
        } catch (error) {
          const mimeType = 'video/mp2t';
          const output = await exportBlobDownload({
            blob: joinSegmentsToBlob(parts, mimeType),
            filename: rawSegmentOutputName({
              displayName: input.candidate.displayName,
              protocol: 'hls',
            }),
            mimeType,
            saveAs: input.job.selection.saveAs,
            writeFile: input.writeFile,
            createObjectUrl: input.createObjectUrl,
            revokeObjectUrl: input.revokeObjectUrl,
            download: input.download,
          });

          return {
            ...output,
            notes: [`mux.js transmux failed: ${errorMessage(error)}. Saved raw MPEG-TS segments.`],
          };
        }
      }

      return exportBlobDownload({
        blob: joinSegmentsToBlob(parts, 'video/mp2t'),
        filename: rawSegmentOutputName({
          displayName: input.candidate.displayName,
          protocol: 'hls',
        }),
        mimeType: 'video/mp2t',
        saveAs: input.job.selection.saveAs,
        writeFile: input.writeFile,
        createObjectUrl: input.createObjectUrl,
        revokeObjectUrl: input.revokeObjectUrl,
        download: input.download,
      });
    },
  });
}
