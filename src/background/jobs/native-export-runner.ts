import type {
  DownloadJob,
  JobOutput,
  MediaCandidate,
  SubtitleTrack,
} from '@/video_downloader_types_skeleton';
import type {
  NativeFfmpegClient,
} from '@/src/native/native-ffmpeg-client';
import type { NativeFfmpegOutputKind, NativeFfmpegProtocol } from '@/src/native/native-ffmpeg-contract';
import type { JobStore } from './job-store';
import { resolveOutputContainer } from '@/src/core/export/output-container';
import {
  deriveSubtitleFilename,
  type SubtitleFormat,
} from '@/src/core/naming/subtitle-filename';
import type { SubtitleStore } from '@/src/core/storage/subtitle-store';

export interface NativeExportRunnerInput {
  candidate: MediaCandidate;
  job: DownloadJob;
  nativeClient: NativeFfmpegClient;
  jobStore?: JobStore;
  subtitleStore?: SubtitleStore;
  fetchText?: (url: string, init?: RequestInit) => Promise<string>;
}

function isProtected(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'unknown' ||
    candidate.protection.kind === 'sample-aes'
  );
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

export async function runNativeExportJob({
  candidate,
  job,
  nativeClient,
  jobStore,
  subtitleStore,
  fetchText,
}: NativeExportRunnerInput): Promise<JobOutput> {
  if (isProtected(candidate)) {
    throw new Error('Protected media cannot be exported by the native helper.');
  }

  jobStore?.update(job.id, { phase: 'preparing', progressPct: 5 });

  const outputKind = outputKindFor(candidate, job);
  const outputName = outputNameFor(candidate, outputKind);
  const sidecarOutputs = await preStoreSubtitles({
    candidate,
    job,
    outputName,
    subtitleStore,
    fetchText,
  });
  const result = await nativeClient.exportMedia({
    jobId: job.id,
    inputUrl: inputUrlFor(candidate),
    protocol: nativeProtocol(candidate),
    outputName,
    outputKind,
    ...(job.selection.trim ? { trim: job.selection.trim } : {}),
  });

  jobStore?.update(job.id, { phase: 'exporting', progressPct: 15 });

  return {
    fileName: fileNameFromPath(result.outputPath),
    mimeType: result.mimeType ?? candidate.mimeType ?? 'application/octet-stream',
    outputUrl: result.outputPath,
    ...(result.sizeBytes !== undefined ? { sizeBytes: result.sizeBytes } : {}),
    ...(sidecarOutputs.length > 0 ? { sidecarOutputs } : {}),
  };
}
