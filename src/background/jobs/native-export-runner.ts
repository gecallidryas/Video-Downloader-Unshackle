import type {
  DownloadJob,
  JobOutput,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import type {
  NativeFfmpegClient,
} from '@/src/native/native-ffmpeg-client';
import type { NativeFfmpegOutputKind, NativeFfmpegProtocol } from '@/src/native/native-ffmpeg-contract';
import type { JobStore } from './job-store';

export interface NativeExportRunnerInput {
  candidate: MediaCandidate;
  job: DownloadJob;
  nativeClient: NativeFfmpegClient;
  jobStore?: JobStore;
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

function outputKindFor(job: DownloadJob): NativeFfmpegOutputKind {
  const outputKind = job.selection.outputKind;

  if (
    outputKind === 'original' ||
    outputKind === 'mp4' ||
    outputKind === 'webm' ||
    outputKind === 'audio-only'
  ) {
    return outputKind;
  }

  return 'mp4';
}

function extensionFor(kind: NativeFfmpegOutputKind, candidate: MediaCandidate): string {
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
  const hasExtension = candidate.displayName.toLowerCase().endsWith(`.${extension}`);

  return hasExtension ? candidate.displayName : `${candidate.displayName}.${extension}`;
}

function fileNameFromPath(outputPath: string): string {
  return outputPath.split(/[\\/]/).pop() || outputPath;
}

export async function runNativeExportJob({
  candidate,
  job,
  nativeClient,
  jobStore,
}: NativeExportRunnerInput): Promise<JobOutput> {
  if (isProtected(candidate)) {
    throw new Error('Protected media cannot be exported by the native helper.');
  }

  jobStore?.update(job.id, { phase: 'preparing', progressPct: 5 });

  const outputKind = outputKindFor(job);
  const result = await nativeClient.exportMedia({
    jobId: job.id,
    inputUrl: inputUrlFor(candidate),
    protocol: nativeProtocol(candidate),
    outputName: outputNameFor(candidate, outputKind),
    outputKind,
    ...(job.selection.trim ? { trim: job.selection.trim } : {}),
  });

  jobStore?.update(job.id, { phase: 'exporting', progressPct: 15 });

  return {
    fileName: fileNameFromPath(result.outputPath),
    mimeType: result.mimeType ?? candidate.mimeType ?? 'application/octet-stream',
    outputUrl: result.outputPath,
    ...(result.sizeBytes !== undefined ? { sizeBytes: result.sizeBytes } : {}),
  };
}
