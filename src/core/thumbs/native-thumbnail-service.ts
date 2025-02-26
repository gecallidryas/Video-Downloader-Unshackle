import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import type { NativeFfmpegClient } from '@/src/native/native-ffmpeg-client';
import type { NativeFfmpegThumbnailFormat } from '@/src/native/native-ffmpeg-contract';

export interface ThumbnailAssetResult {
  assetUrl: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  generated: boolean;
}

export interface EnsureNativeThumbnailOptions {
  nativeClient: NativeFfmpegClient;
  format?: NativeFfmpegThumbnailFormat;
  atSec?: number;
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
    throw new Error('Missing media URL for thumbnail generation.');
  }

  return inputUrl;
}

function staticThumbnailUrl(candidate: MediaCandidate): string | undefined {
  return candidate.thumbnails?.heroUrl ?? candidate.posterUrl;
}

function mimeFor(format: NativeFfmpegThumbnailFormat): ThumbnailAssetResult['mimeType'] {
  if (format === 'png') {
    return 'image/png';
  }
  if (format === 'webp') {
    return 'image/webp';
  }

  return 'image/jpeg';
}

function defaultAtSec(candidate: MediaCandidate): number {
  if (candidate.durationSec && Number.isFinite(candidate.durationSec)) {
    return Math.max(0, Math.floor(candidate.durationSec * 0.1));
  }

  return 0;
}

export async function ensureNativeThumbnail(
  candidate: MediaCandidate,
  options: EnsureNativeThumbnailOptions,
): Promise<ThumbnailAssetResult> {
  if (isProtected(candidate)) {
    throw new Error('Protected media cannot generate preview assets.');
  }

  const existing = staticThumbnailUrl(candidate);
  if (existing) {
    return {
      assetUrl: existing,
      mimeType: 'image/jpeg',
      generated: false,
    };
  }

  const format = options.format ?? 'jpg';
  const result = await options.nativeClient.extractThumbnail({
    candidateId: candidate.id,
    inputUrl: inputUrlFor(candidate),
    atSec: options.atSec ?? defaultAtSec(candidate),
    format,
  });
  const dataUrl = result.dataUrl;

  if (!dataUrl) {
    throw new Error('Native helper did not return an extension-safe thumbnail asset.');
  }

  return {
    assetUrl: dataUrl,
    mimeType: (result.mimeType as ThumbnailAssetResult['mimeType']) || mimeFor(format),
    generated: true,
  };
}
