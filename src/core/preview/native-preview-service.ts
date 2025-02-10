import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import type { NativeFfmpegClient } from '@/src/native/native-ffmpeg-client';
import type { NativeFfmpegPreviewFormat } from '@/src/native/native-ffmpeg-contract';
import {
  clearPreviewAssets,
  getLatestPreviewAsset,
  getPreviewAsset,
  previewCacheKey,
  setPreviewAsset,
} from './preview-cache';

export interface PreviewAsset {
  assetUrl: string;
  mimeType: 'video/webm' | 'video/mp4' | 'image/gif';
  generated: boolean;
}

export interface EnsurePreviewClipOptions {
  nativeClient: NativeFfmpegClient;
  format?: NativeFfmpegPreviewFormat;
  startSec?: number;
  durationSec?: number;
}

function isProtected(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'unknown' ||
    candidate.protection.kind === 'sample-aes'
  );
}

function inputUrlFor(candidate: MediaCandidate): string {
  const inputUrl = candidate.sourceUrl ?? candidate.manifestUrl;

  if (!inputUrl) {
    throw new Error('Missing media URL for preview generation.');
  }

  return inputUrl;
}

function mimeFor(format: NativeFfmpegPreviewFormat): PreviewAsset['mimeType'] {
  if (format === 'mp4') {
    return 'video/mp4';
  }
  if (format === 'gif') {
    return 'image/gif';
  }

  return 'video/webm';
}

function defaultStartSec(candidate: MediaCandidate): number {
  if (candidate.durationSec && Number.isFinite(candidate.durationSec)) {
    return Math.max(0, Math.floor(candidate.durationSec * 0.1));
  }

  return 0;
}

export async function ensurePreviewClip(
  candidate: MediaCandidate,
  options: EnsurePreviewClipOptions,
): Promise<PreviewAsset> {
  if (isProtected(candidate)) {
    throw new Error('Protected media cannot generate preview assets.');
  }

  const format = options.format ?? 'webm';
  const startSec = options.startSec ?? defaultStartSec(candidate);
  const durationSec = options.durationSec ?? 3;
  const key = previewCacheKey({ candidateId: candidate.id, format, startSec, durationSec });
  const cached = getPreviewAsset(key);

  if (cached) {
    return cached;
  }

  const result = await options.nativeClient.extractPreviewClip({
    candidateId: candidate.id,
    inputUrl: inputUrlFor(candidate),
    startSec,
    durationSec,
    format,
  });

  return setPreviewAsset(key, {
    assetUrl: result.outputPath,
    mimeType: (result.mimeType as PreviewAsset['mimeType']) || mimeFor(format),
    generated: true,
  });
}

export function getCachedPreview(candidateId: string): PreviewAsset | undefined {
  return getLatestPreviewAsset(candidateId);
}

export function clearPreviewCache(candidateId?: string): void {
  clearPreviewAssets(candidateId);
}
