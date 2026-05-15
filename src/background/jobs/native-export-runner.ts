import type {
  DownloadJob,
  JobOutput,
  MediaCandidate,
  SubtitleTrack,
} from '@/video_downloader_types_skeleton';
import type {
  NativeFfmpegClient,
} from '@/src/native/native-ffmpeg-client';
import type {
  NativeFfmpegOutputKind,
  NativeFfmpegProtocol,
  NativeSidecarOutput,
  NativeYtDlpQuality,
} from '@/src/native/native-ffmpeg-contract';
import type { JobStore } from './job-store';
import { resolveOutputContainer } from '@/src/core/export/output-container';
import {
  deriveSubtitleFilename,
  type SubtitleFormat,
} from '@/src/core/naming/subtitle-filename';
import type { SubtitleStore } from '@/src/core/storage/subtitle-store';
import type { ReadFullNativeOutputInput } from '@/src/background/assets/native-asset-server';

export type DeliverNativeOutput = (input: {
  blob: Blob;
  fileName: string;
  mimeType: string;
}) => Promise<number | undefined>;

export interface NativeExportRunnerInput {
  candidate: MediaCandidate;
  job: DownloadJob;
  nativeClient: NativeFfmpegClient;
  jobStore?: JobStore;
  subtitleStore?: SubtitleStore;
  fetchText?: (url: string, init?: RequestInit) => Promise<string>;
  readFullOutput?: (input: ReadFullNativeOutputInput) => Promise<Blob>;
  deliverOutput?: DeliverNativeOutput;
  headers?: Record<string, string>;
  // Advanced-mode yt-dlp overrides. The native helper re-validates and denylists
  // these, so they are forwarded as-is and only apply to page (yt-dlp) exports.
  ytDlpBinaryPath?: string;
  ytDlpCustomArgs?: string;
}

export function parseYtDlpCustomArgs(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  const tokens: string[] = [];
  // Split on whitespace while honoring single/double quotes so values like
  // --user-agent "Mozilla/5.0 ..." survive as one argument.
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const token = match[1] ?? match[2] ?? match[3] ?? '';
    if (token.length > 0 && !/[\r\n\0]/.test(token)) {
      tokens.push(token);
    }
  }

  return tokens;
}

const PROGRESS_PHASE_MAP: Record<string, DownloadJob['phase']> = {
  preparing: 'preparing',
  probing: 'preparing',
  fetching: 'fetching',
  transmuxing: 'transmuxing',
  exporting: 'exporting',
  extracting: 'exporting',
  completed: 'exporting',
};

function isProtected(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'unknown' ||
    candidate.protection.kind === 'sample-aes'
  );
}

// Routing policy: yt-dlp is the engine for page/site candidates — those with a
// page URL but no raw media URL we can hand straight to ffmpeg (protocol
// 'unknown'/'blob', or a candidate carrying only a pageUrl). ffmpeg stays the
// engine for raw manifest/direct exports (direct/hls/dash with a real source or
// manifest URL), which it already handles with copy-muxing.
export function shouldRouteToYtDlp(candidate: MediaCandidate): boolean {
  if (!candidate.pageUrl) {
    return false;
  }

  const hasDirectMediaUrl = Boolean(candidate.sourceUrl || candidate.manifestUrl);
  const isSiteProtocol = candidate.protocol === 'unknown' || candidate.protocol === 'blob';

  return isSiteProtocol || !hasDirectMediaUrl;
}

export function mapYtDlpQuality(job: DownloadJob): NativeYtDlpQuality {
  const outputKind = job.selection.outputKind;

  if (outputKind === 'audio-only') {
    return 'audio-only';
  }
  if (outputKind === 'mp4') {
    return 'best-mp4';
  }
  if (job.selection.mode === 'smallest') {
    return 'worst';
  }

  return 'best';
}

function nativeProtocol(candidate: MediaCandidate): NativeFfmpegProtocol {
  if (candidate.protocol === 'direct' || candidate.protocol === 'hls' || candidate.protocol === 'dash') {
    return candidate.protocol;
  }

  throw new Error(`Unsupported native export protocol: ${candidate.protocol}`);
}

function inputUrlFor(candidate: MediaCandidate): string {
  const inputUrl = candidate.protocol === 'direct'
    ? candidate.sourceUrl
    : candidate.manifestUrl ?? candidate.sourceUrl;

  if (!inputUrl) {
    throw new Error('Missing media URL for native export.');
  }

  return inputUrl;
}

function selectedSubtitleTracks(
  candidate: MediaCandidate,
  job: DownloadJob,
): SubtitleTrack[] {
  const selectedIds = new Set(job.selection.subtitleTrackIds ?? []);

  if (selectedIds.size === 0) {
    return [];
  }

  return candidate.subtitleTracks.filter((track) => selectedIds.has(track.id));
}

function outputKindFor(
  candidate: MediaCandidate,
  job: DownloadJob,
): NativeFfmpegOutputKind {
  const outputKind = job.selection.outputKind;

  if (
    outputKind === 'original' ||
    outputKind === 'mp4' ||
    outputKind === 'mkv' ||
    outputKind === 'webm' ||
    outputKind === 'audio-only'
  ) {
    return outputKind;
  }

  return resolveOutputContainer({
    hasSubtitles:
      selectedSubtitleTracks(candidate, job).length > 0 &&
      job.selection.subtitleOutput !== 'sidecar',
  }) as NativeFfmpegOutputKind;
}

function extensionFor(kind: NativeFfmpegOutputKind, candidate: MediaCandidate): string {
  if (kind === 'mkv') {
    return 'mkv';
  }
  if (kind === 'webm') {
    return 'webm';
  }
  if (kind === 'audio-only') {
    return 'mp3';
  }
  if (kind === 'original') {
    return candidate.fileExtensionHint ?? 'mp4';
  }

  return 'mp4';
}

function outputNameFor(candidate: MediaCandidate, kind: NativeFfmpegOutputKind): string {
  const extension = extensionFor(kind, candidate);
  const name = candidate.displayName.replace(/\.(?:mp4|mkv|webm|mp3|m4v|mov|ts)$/i, '');
  const hasExtension = candidate.displayName.toLowerCase().endsWith(`.${extension}`);

  return hasExtension ? candidate.displayName : `${name}.${extension}`;
}

function fileNameFromPath(outputPath: string): string {
  return outputPath.split(/[\\/]/).pop() || outputPath;
}

function subtitleFormatFor(track: SubtitleTrack): SubtitleFormat {
  if (track.format === 'srt' || track.format === 'ttml') {
    return track.format;
  }

  return 'vtt';
}

async function defaultFetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Failed to fetch subtitle: ${response.status}`);
  }

  return response.text();
}

async function preStoreSubtitles(input: {
  candidate: MediaCandidate;
  job: DownloadJob;
  outputName: string;
  subtitleStore?: SubtitleStore;
  fetchText?: (url: string, init?: RequestInit) => Promise<string>;
}): Promise<NonNullable<JobOutput['sidecarOutputs']>> {
  if (!input.subtitleStore) {
    return [];
  }

  const fetchText = input.fetchText ?? defaultFetchText;
  const tracks = selectedSubtitleTracks(input.candidate, input.job).filter(
    (track) => Boolean(track.url),
  );
  const sidecarOutputs: NonNullable<JobOutput['sidecarOutputs']> = [];

  await Promise.all(
    tracks.map(async (track) => {
      const url = track.url;

      if (!url) {
        return;
      }

      const format = subtitleFormatFor(track);
      const content = await fetchText(url, { credentials: 'include' });
      const fileName = deriveSubtitleFilename({
        videoFilename: input.outputName,
        language: track.language,
        trackName: track.label,
        format,
      });
      await input.subtitleStore?.put({
        jobId: input.job.id,
        trackId: track.id,
        ...(track.language ? { language: track.language } : {}),
        format,
        fileName,
        content,
      });
      if (
        input.job.selection.subtitleOutput === 'sidecar' ||
        input.job.selection.subtitleOutput === 'both'
      ) {
        sidecarOutputs.push({
          fileName,
          mimeType: format === 'srt' ? 'application/x-subrip' : 'text/vtt',
          sizeBytes:
            typeof TextEncoder !== 'undefined'
              ? new TextEncoder().encode(content).byteLength
              : content.length,
        });
      }
    }),
  );

  return sidecarOutputs;
}

async function defaultDeliverOutput(input: {
  blob: Blob;
  fileName: string;
  mimeType: string;
}): Promise<number | undefined> {
  const createObjectUrl =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL.bind(URL)
      : undefined;
  const revokeObjectUrl =
    typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function'
      ? URL.revokeObjectURL.bind(URL)
      : undefined;

  if (!createObjectUrl || typeof chrome === 'undefined' || !chrome.downloads?.download) {
    return undefined;
  }

  const url = createObjectUrl(input.blob);
  try {
    return await chrome.downloads.download({
      url,
      filename: input.fileName,
      saveAs: false,
    });
  } finally {
    if (revokeObjectUrl) {
      setTimeout(() => revokeObjectUrl(url), 60_000);
    }
  }
}

export async function runNativeExportJob({
  candidate,
  job,
  nativeClient,
  jobStore,
  subtitleStore,
  fetchText,
  readFullOutput,
  deliverOutput,
  headers,
  ytDlpBinaryPath,
  ytDlpCustomArgs,
}: NativeExportRunnerInput): Promise<JobOutput> {
  if (isProtected(candidate)) {
    throw new Error('Protected media cannot be exported by the native helper.');
  }

  jobStore?.update(job.id, { phase: 'preparing', progressPct: 5 });

  if (shouldRouteToYtDlp(candidate)) {
    return runYtDlpExport({
      candidate,
      job,
      nativeClient,
      jobStore,
      readFullOutput,
      deliverOutput,
      headers,
      ytDlpBinaryPath,
      ytDlpCustomArgs,
    });
  }

  const outputKind = outputKindFor(candidate, job);
  const outputName = outputNameFor(candidate, outputKind);
  const sidecarOutputs = await preStoreSubtitles({
    candidate,
    job,
    outputName,
    subtitleStore,
    fetchText,
  });
  const result = await nativeClient.exportMedia(
    {
      jobId: job.id,
      inputUrl: inputUrlFor(candidate),
      protocol: nativeProtocol(candidate),
      outputName,
      outputKind,
      ...(job.selection.trim ? { trim: job.selection.trim } : {}),
      ...(headers ? { headers } : {}),
    },
    {
      onProgress: (progress) => {
        jobStore?.update(job.id, {
          phase: PROGRESS_PHASE_MAP[progress.phase] ?? 'exporting',
          progressPct: progress.progressPct,
        });
      },
    },
  );

  jobStore?.update(job.id, { phase: 'exporting', progressPct: 90 });

  const fileName = fileNameFromPath(result.outputPath);
  const mimeType = result.mimeType ?? candidate.mimeType ?? 'application/octet-stream';

  const deliveredId = await deliverNativeOutput({
    outputPath: result.outputPath,
    fileName,
    mimeType,
    ...(result.sizeBytes !== undefined ? { totalBytes: result.sizeBytes } : {}),
    readFullOutput,
    deliverOutput: deliverOutput ?? defaultDeliverOutput,
  });

  return {
    fileName,
    mimeType,
    outputUrl: result.outputPath,
    ...(deliveredId !== undefined ? { downloadId: deliveredId } : {}),
    ...(result.sizeBytes !== undefined ? { sizeBytes: result.sizeBytes } : {}),
    ...(sidecarOutputs.length > 0 ? { sidecarOutputs } : {}),
  };
}

async function runYtDlpExport(input: {
  candidate: MediaCandidate;
  job: DownloadJob;
  nativeClient: NativeFfmpegClient;
  jobStore?: JobStore;
  readFullOutput?: (input: ReadFullNativeOutputInput) => Promise<Blob>;
  deliverOutput?: DeliverNativeOutput;
  headers?: Record<string, string>;
  ytDlpBinaryPath?: string;
  ytDlpCustomArgs?: string;
}): Promise<JobOutput> {
  const {
    candidate,
    job,
    nativeClient,
    jobStore,
    readFullOutput,
    deliverOutput,
    headers,
    ytDlpBinaryPath,
    ytDlpCustomArgs,
  } = input;
  const quality = mapYtDlpQuality(job);
  const binaryPath = ytDlpBinaryPath?.trim();
  const extraArgs = parseYtDlpCustomArgs(ytDlpCustomArgs);
  const outputKind: NativeFfmpegOutputKind = quality === 'audio-only' ? 'audio-only' : 'mp4';
  const outputName = outputNameFor(candidate, outputKind);

  const subtitleOutput = job.selection.subtitleOutput;
  const wantsSubtitles =
    subtitleOutput === 'embed' || subtitleOutput === 'sidecar' || subtitleOutput === 'both';
  const trackLanguages = Array.from(
    new Set(
      selectedSubtitleTracks(candidate, job)
        .map((track) => track.language)
        .filter((language): language is string => Boolean(language)),
    ),
  );
  // Known track languages drive the request; for page candidates with no known
  // tracks, 'all' lets yt-dlp fetch every available subtitle. embed mux + sidecar
  // file writing are independent so 'both' delivers both.
  const subtitleLanguages =
    trackLanguages.length > 0 ? trackLanguages : wantsSubtitles ? ['all'] : [];
  const embedSubtitles = subtitleOutput !== 'sidecar';
  const writeSubtitles = subtitleOutput === 'sidecar' || subtitleOutput === 'both';

  const result = await nativeClient.exportYtDlp(
    {
      jobId: job.id,
      inputUrl: candidate.pageUrl,
      outputName,
      quality,
      ...(subtitleLanguages.length > 0
        ? { subtitleLanguages, embedSubtitles, writeSubtitles }
        : {}),
      ...(job.selection.trim ? { trim: job.selection.trim } : {}),
      ...(headers ? { headers } : {}),
      ...(binaryPath ? { binaryPath } : {}),
      ...(extraArgs.length > 0 ? { extraArgs } : {}),
    },
    {
      onProgress: (progress) => {
        jobStore?.update(job.id, {
          phase: PROGRESS_PHASE_MAP[progress.phase] ?? 'fetching',
          progressPct: progress.progressPct,
        });
      },
    },
  );

  jobStore?.update(job.id, { phase: 'exporting', progressPct: 90 });

  const fileName = fileNameFromPath(result.outputPath);
  const mimeType = result.mimeType ?? candidate.mimeType ?? 'application/octet-stream';
  const resolvedDeliver = deliverOutput ?? defaultDeliverOutput;

  const deliveredId = await deliverNativeOutput({
    outputPath: result.outputPath,
    fileName,
    mimeType,
    ...(result.sizeBytes !== undefined ? { totalBytes: result.sizeBytes } : {}),
    readFullOutput,
    deliverOutput: resolvedDeliver,
  });

  const sidecarOutputs = await deliverYtDlpSidecars({
    sidecars: result.sidecarOutputs ?? [],
    readFullOutput,
    deliverOutput: resolvedDeliver,
  });

  return {
    fileName,
    mimeType,
    outputUrl: result.outputPath,
    ...(deliveredId !== undefined ? { downloadId: deliveredId } : {}),
    ...(result.sizeBytes !== undefined ? { sizeBytes: result.sizeBytes } : {}),
    ...(sidecarOutputs.length > 0 ? { sidecarOutputs } : {}),
  };
}

async function deliverYtDlpSidecars(input: {
  sidecars: NativeSidecarOutput[];
  readFullOutput?: (input: ReadFullNativeOutputInput) => Promise<Blob>;
  deliverOutput: DeliverNativeOutput;
}): Promise<NonNullable<JobOutput['sidecarOutputs']>> {
  const delivered: NonNullable<JobOutput['sidecarOutputs']> = [];

  for (const sidecar of input.sidecars) {
    await deliverNativeOutput({
      outputPath: sidecar.outputPath,
      fileName: sidecar.fileName,
      mimeType: sidecar.mimeType,
      ...(sidecar.sizeBytes !== undefined ? { totalBytes: sidecar.sizeBytes } : {}),
      readFullOutput: input.readFullOutput,
      deliverOutput: input.deliverOutput,
    });

    delivered.push({
      fileName: sidecar.fileName,
      mimeType: sidecar.mimeType,
      ...(sidecar.sizeBytes !== undefined ? { sizeBytes: sidecar.sizeBytes } : {}),
    });
  }

  return delivered;
}

async function deliverNativeOutput(input: {
  outputPath: string;
  fileName: string;
  mimeType: string;
  totalBytes?: number;
  readFullOutput?: (input: ReadFullNativeOutputInput) => Promise<Blob>;
  deliverOutput: DeliverNativeOutput;
}): Promise<number | undefined> {
  if (!input.readFullOutput) {
    // Chunked read of the host-owned output is not wired in this runtime; the
    // file stays in the helper's private outputs dir and cannot reach the user.
    throw new Error(
      'Native output delivery is unavailable: chunked output reads are not configured.',
    );
  }

  const blob = await input.readFullOutput({
    outputPath: input.outputPath,
    mimeType: input.mimeType,
    ...(input.totalBytes !== undefined ? { totalBytes: input.totalBytes } : {}),
  });

  return input.deliverOutput({
    blob,
    fileName: input.fileName,
    mimeType: input.mimeType,
  });
}
