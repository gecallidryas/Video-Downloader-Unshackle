import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  isNativeFfmpegUnavailableError,
  type NativeFfmpegClient,
} from '@/src/native/native-ffmpeg-client';
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
  nativeClient?: NativeFfmpegClient;
  offscreenRecord?: (
    message: Record<string, unknown>,
  ) => Promise<{ ok: boolean; assetUrl: string; mimeType: string }>;
  format?: NativeFfmpegPreviewFormat;
  startSec?: number;
  durationSec?: number;
}

export class PreviewGenerationError extends Error {
  constructor(
    readonly code: 'PROTECTED_MEDIA' | 'NATIVE_REQUIRED' | 'OFFSCREEN_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'PreviewGenerationError';
  }
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
    throw new PreviewGenerationError(
      'PROTECTED_MEDIA',
      'Protected media cannot generate preview assets.',
    );
  }

  const format = options.format ?? 'webm';
  const startSec = options.startSec ?? defaultStartSec(candidate);
  const durationSec = options.durationSec ?? 3;
  const key = previewCacheKey({ candidateId: candidate.id, format, startSec, durationSec });
  const cached = getPreviewAsset(key);

  if (cached) {
    return cached;
  }

  let nativeUnavailable = false;

  if (options.nativeClient) {
    try {
      const result = await options.nativeClient.extractPreviewClip({
        candidateId: candidate.id,
        inputUrl: inputUrlFor(candidate),
        startSec,
        durationSec,
        format,
      });
      const dataUrl = result.dataUrl;

      if (!dataUrl) {
        throw new Error('Native helper did not return an extension-safe preview asset.');
      }

      return setPreviewAsset(key, {
        assetUrl: dataUrl,
        mimeType: (result.mimeType as PreviewAsset['mimeType']) || mimeFor(format),
        generated: true,
      });
    } catch (error) {
      if (!isNativeFfmpegUnavailableError(error)) {
        throw error;
      }

      nativeUnavailable = true;
    }
  }

  if (options.offscreenRecord && candidate.protocol === 'direct') {
    const offscreenResult = await options.offscreenRecord({
      type: 'GENERATE_PREVIEW_CLIP',
      url: inputUrlFor(candidate),
      startSec,
      durationSec,
    });

    if (!offscreenResult.ok || !offscreenResult.assetUrl) {
      throw new PreviewGenerationError(
        'OFFSCREEN_FAILED',
        'Offscreen MediaRecorder did not return a preview asset.',
      );
    }

    // MediaRecorder on Chromium always outputs WebM
    const offscreenKey = previewCacheKey({
      candidateId: candidate.id,
      format: 'webm',
      startSec,
      durationSec,
    });

    return setPreviewAsset(offscreenKey, {
      assetUrl: offscreenResult.assetUrl,
      mimeType: (offscreenResult.mimeType as PreviewAsset['mimeType']) || 'video/webm',
      generated: true,
    });
  }

  if (
    nativeUnavailable ||
    candidate.protocol === 'hls' ||
    candidate.protocol === 'dash'
  ) {
    throw new PreviewGenerationError(
      'NATIVE_REQUIRED',
      'Generated previews for this media require the native helper.',
    );
  }

  throw new Error(
    'No preview generation strategy available. Provide a native client or offscreen recorder for a direct-protocol candidate.',
  );
}

export function getCachedPreview(candidateId: string): PreviewAsset | undefined {
  return getLatestPreviewAsset(candidateId);
}

export function clearPreviewCache(candidateId?: string): void {
  clearPreviewAssets(candidateId);
}
