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
import { dashRequiresSeparateAudioVideo } from '@/src/core/dash/plan-dash-segments';
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
  bandwidthBytesPerSecond?: number;
  segmentTimeoutMs?: number;
  memoryCeilingBytes?: number;
  fragmentStore?: Parameters<typeof runDashJob>[0]['fragmentStore'];
  onFragmentStored?: Parameters<typeof runDashJob>[0]['onFragmentStored'];
  signal?: AbortSignal;
}

interface DashRawOutputKind {
  extension: 'mp4' | 'bin';
  mimeType: 'video/mp4' | 'application/octet-stream';
}

const DEFAULT_DASH_MEMORY_CEILING_BYTES = 150 * 1024 * 1024;

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

function presentTrackTypes(plan: SegmentPlan): Set<NonNullable<SegmentDescriptor['trackType']>> {
  return new Set(
    plan.segments
      .map((segment: SegmentDescriptor) => segment.trackType)
      .filter((trackType): trackType is NonNullable<SegmentDescriptor['trackType']> =>
        Boolean(trackType),
      ),
  );
}

function isMultiTrackPlan(plan: SegmentPlan): boolean {
  return presentTrackTypes(plan).size > 1;
}

// A single-track DASH representation with an init segment and fMP4 (.m4s) media
// segments concatenates into a valid fragmented-MP4 file. Such a file plays in
// browsers and players when given a .mp4 container/extension, so finalize it as
// MP4 rather than saving a mislabeled .m4s artifact that many players reject.
function isConfidentSingleTrackFmp4(plan: SegmentPlan): boolean {
  const hasInit = plan.segments.some((segment) => segment.initSegment);
  const mediaSegments = plan.segments.filter((segment) => !segment.initSegment);

  return (
    hasInit &&
    mediaSegments.length > 0 &&
    !isMultiTrackPlan(plan) &&
    mediaSegments.every((segment) => urlPathExtension(segment.url) === 'm4s')
  );
}

function dashRawOutputKind(plan: SegmentPlan): DashRawOutputKind {
  if (isConfidentSingleTrackFmp4(plan)) {
    return {
      extension: 'mp4',
      mimeType: 'video/mp4',
    };
  }

  return {
    extension: 'bin',
    mimeType: 'application/octet-stream',
  };
}

function totalBytes(parts: Uint8Array[]): number {
  return parts.reduce((sum, part) => sum + part.byteLength, 0);
}

export async function runBrowserDashExportJob(
  input: RunBrowserDashExportJobInput,
): Promise<JobOutput> {
  if (!input.allowProtected && isBlockedProtection(input.candidate)) {
    throw new Error('Protected DASH media cannot be exported by the browser runner.');
  }

  if (dashRequiresSeparateAudioVideo(input.manifest)) {
    throw new Error(
      'Browser-only DASH export cannot mux separate audio and video tracks into a playable file; enable native FFmpeg export for this multi-track stream.',
    );
  }

  const fetchBytes = input.fetchBytes ?? defaultFetchBytes;
  const memoryCeilingBytes = input.memoryCeilingBytes ?? DEFAULT_DASH_MEMORY_CEILING_BYTES;

  return runDashJob({
    job: input.job,
    manifest: input.manifest,
    allowProtected: input.allowProtected,
    concurrency: input.concurrency,
    maxConcurrentPerHost: input.maxConcurrentPerHost,
    bandwidthBytesPerSecond: input.bandwidthBytesPerSecond,
    segmentTimeoutMs: input.segmentTimeoutMs,
    signal: input.signal,
    ...(input.fragmentStore ? { fragmentStore: input.fragmentStore } : {}),
    ...(input.onFragmentStored ? { onFragmentStored: input.onFragmentStored } : {}),
    fetchSegment: (segment, _plan, request) =>
      fetchBytes(segment.url, requestInitFromScheduler(request)),
    writeOutput: async (plan, parts) => {
      if (isMultiTrackPlan(plan)) {
        throw new Error(
          'Browser-only DASH export cannot mux separate audio and video tracks into a playable file; enable native FFmpeg export for this multi-track stream.',
        );
      }

      // The browser DASH path concatenates every segment into one in-memory blob.
      // Refuse oversize single-track downloads that would OOM the worker (mirrors
      // the HLS in-memory ceiling) and defer them to native FFmpeg. Direct-to-disk
      // writers stream past the heap, so they are exempt.
      const outputBytes = totalBytes(parts);

      if (!input.writeFile && outputBytes > memoryCeilingBytes) {
        throw new Error(
          `Browser DASH export exceeded the safe in-memory limit (${String(outputBytes)} bytes > ${String(memoryCeilingBytes)} bytes). Enable native FFmpeg or direct-to-disk output for large DASH downloads.`,
        );
      }

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
