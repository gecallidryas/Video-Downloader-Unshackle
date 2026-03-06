import type {
  DownloadJob,
  JobOutput,
  MediaCandidate,
  SegmentDescriptor,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
import type { ChromeDownload } from '@/src/core/export/downloads-export';
import {
  exportBlobDownload,
  joinSegmentsToBlob,
  rawSegmentOutputName,
} from '@/src/core/export/downloads-export';
import type { ParsedDashManifest } from '@/src/core/dash/parse-mpd';
import { runDashJob } from '@/src/core/dash/run-dash-job';

export type FetchBrowserDashBytes = (
  url: string,
  init: RequestInit,
) => Promise<Uint8Array>;

export interface RunBrowserDashExportJobInput {
  candidate: MediaCandidate;
  job: DownloadJob;
  manifest: ParsedDashManifest;
  download?: ChromeDownload;
  writeFile?: (filename: string, data: Uint8Array) => Promise<void>;
  fetchBytes?: FetchBrowserDashBytes;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  allowProtected?: boolean;
  concurrency?: number;
  maxConcurrentPerHost?: number;
  segmentTimeoutMs?: number;
  signal?: AbortSignal;
}

interface DashRawOutputKind {
  extension: 'm4s' | 'bin';
  mimeType: 'video/iso.segment' | 'application/octet-stream';
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
    throw new Error(`DASH fetch failed: ${response.status}`);
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

function urlPathExtension(url: string): string | undefined {
  try {
    return new URL(url).pathname.split('.').pop()?.toLowerCase();
  } catch {
    return url.split(/[?#]/, 1)[0]?.split('.').pop()?.toLowerCase();
  }
}

function isConfidentSingleTrackM4s(plan: SegmentPlan): boolean {
  const trackTypes = new Set(
    plan.segments
      .map((segment: SegmentDescriptor) => segment.trackType)
      .filter((trackType): trackType is NonNullable<SegmentDescriptor['trackType']> =>
        Boolean(trackType),
      ),
  );
  const hasInit = plan.segments.some((segment) => segment.initSegment);
  const mediaSegments = plan.segments.filter((segment) => !segment.initSegment);

  return (
    hasInit &&
    mediaSegments.length > 0 &&
    trackTypes.size <= 1 &&
    mediaSegments.every((segment) => urlPathExtension(segment.url) === 'm4s')
  );
}

function dashRawOutputKind(plan: SegmentPlan): DashRawOutputKind {
  if (isConfidentSingleTrackM4s(plan)) {
    return {
      extension: 'm4s',
      mimeType: 'video/iso.segment',
    };
  }

  return {
    extension: 'bin',
    mimeType: 'application/octet-stream',
  };
}

export async function runBrowserDashExportJob(
  input: RunBrowserDashExportJobInput,
): Promise<JobOutput> {
  if (!input.allowProtected && isBlockedProtection(input.candidate)) {
    throw new Error('Protected DASH media cannot be exported by the browser runner.');
  }

  const fetchBytes = input.fetchBytes ?? defaultFetchBytes;

  return runDashJob({
    job: input.job,
    manifest: input.manifest,
    allowProtected: input.allowProtected,
    concurrency: input.concurrency,
    maxConcurrentPerHost: input.maxConcurrentPerHost,
    segmentTimeoutMs: input.segmentTimeoutMs,
    signal: input.signal,
    fetchSegment: (segment, _plan, request) =>
      fetchBytes(segment.url, requestInitFromScheduler(request)),
    writeOutput: async (plan, parts) => {
      const outputKind = dashRawOutputKind(plan);
      const blob = joinSegmentsToBlob(parts, outputKind.mimeType);

      return exportBlobDownload({
        blob,
        filename: rawSegmentOutputName({
          displayName: input.candidate.displayName,
          protocol: 'dash',
          extension: outputKind.extension,
        }),
        mimeType: outputKind.mimeType,
        saveAs: input.job.selection.saveAs,
        writeFile: input.writeFile,
        createObjectUrl: input.createObjectUrl,
        revokeObjectUrl: input.revokeObjectUrl,
        download: input.download,
      });
    },
  });
}
