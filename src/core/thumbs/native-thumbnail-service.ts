import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  isNativeFfmpegUnavailableError,
  type NativeFfmpegClient,
} from '@/src/native/native-ffmpeg-client';
import type { NativeFfmpegThumbnailFormat } from '@/src/native/native-ffmpeg-contract';

export interface ThumbnailAssetResult {
  assetUrl: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  generated: boolean;
}

export interface EnsureNativeThumbnailOptions {
  nativeClient?: NativeFfmpegClient;
  offscreenCapture?: (message: Record<string, unknown>) => Promise<{ ok: boolean; assetUrl: string; mimeType: string }>;
  format?: NativeFfmpegThumbnailFormat;
  atSec?: number;
  headers?: Record<string, string>;
}

export class ThumbnailGenerationError extends Error {
  constructor(
    readonly code: 'PROTECTED_MEDIA' | 'NATIVE_REQUIRED' | 'OFFSCREEN_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'ThumbnailGenerationError';
  }
}

function isProtected(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
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
    throw new ThumbnailGenerationError(
      'PROTECTED_MEDIA',
      'Protected media cannot generate preview assets.',
    );
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
  let nativeUnavailable = false;

  if (options.nativeClient) {
    try {
      const result = await options.nativeClient.extractThumbnail({
        candidateId: candidate.id,
        inputUrl: inputUrlFor(candidate),
        atSec: options.atSec ?? defaultAtSec(candidate),
        format,
        ...(options.headers ? { headers: options.headers } : {}),
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
    } catch (error) {
      if (!isNativeFfmpegUnavailableError(error)) {
        throw error;
      }

      nativeUnavailable = true;
    }
  }

  if (options.offscreenCapture && (candidate.protocol === 'direct' || candidate.protocol === 'hls')) {
    const canvasFormat = format === 'jpg' ? 'jpeg' : format;
    const result = await options.offscreenCapture({
      type: 'EXTRACT_THUMBNAIL',
      url: inputUrlFor(candidate),
      ...(candidate.protocol === 'hls' ? { protocol: candidate.protocol } : {}),
      atSec: options.atSec ?? defaultAtSec(candidate),
      format: canvasFormat,
    });

    if (!result.ok || !result.assetUrl) {
      throw new ThumbnailGenerationError(
        'OFFSCREEN_FAILED',
        'Offscreen thumbnail capture did not return an asset.',
      );
    }

    return {
      assetUrl: result.assetUrl,
      mimeType: (result.mimeType as ThumbnailAssetResult['mimeType']) || mimeFor(format),
      generated: true,
    };
  }

  if (
    nativeUnavailable ||
    candidate.protocol === 'hls' ||
    candidate.protocol === 'dash'
  ) {
    throw new ThumbnailGenerationError(
      'NATIVE_REQUIRED',
      'Generated thumbnails for this media require the native helper.',
    );
  }

  throw new Error('No thumbnail generation method available.');
}
