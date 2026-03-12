import type {
  DownloadSelection,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';

export type BrowserExportCapability =
  | 'direct-download'
  | 'direct-webm-recording'
  | 'hls-muxjs-mp4'
  | 'dash-raw-segments'
  | 'static-thumbnail'
  | 'direct-frame-thumbnail'
  | 'hls-frame-thumbnail'
  | 'direct-preview-recording'
  | 'hls-browser-preview'
  | 'native-required'
  | 'unsupported';

export interface BrowserCapabilityResult {
  capability: BrowserExportCapability;
  available: boolean;
  reason?: string;
  outputExtension?: string;
  outputMimeType?: string;
}

export interface ResolveBrowserDownloadCapabilityInput {
  candidate: MediaCandidate;
  selection?: DownloadSelection;
  allowBrowserRecording?: boolean;
  enableBrowserFallbacks?: boolean;
  browserTransmuxWithMuxJs?: boolean;
}

export interface ResolveBrowserAssetCapabilityOptions {
  enableBrowserFallbacks?: boolean;
}

function protectedResult(reason = 'Protected media is blocked.'): BrowserCapabilityResult {
  return {
    available: false,
    capability: 'unsupported',
    reason,
  };
}

function nativeRequired(reason: string): BrowserCapabilityResult {
  return {
    available: false,
    capability: 'native-required',
    reason,
  };
}

function browserFallbackDisabled(): BrowserCapabilityResult {
  return nativeRequired('Browser fallback exports are disabled in settings.');
}

function unsupported(reason: string): BrowserCapabilityResult {
  return {
    available: false,
    capability: 'unsupported',
    reason,
  };
}

function isBlockedProtection(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'sample-aes'
  );
}

function hasTrim(selection?: DownloadSelection): boolean {
  const trim = selection?.trim;

  return Boolean(
    (trim?.startSec !== undefined && trim.startSec > 0) ||
      (trim?.endSec !== undefined && trim.endSec > 0),
  );
}

function hasStaticThumbnail(candidate: MediaCandidate): boolean {
  return Boolean(
    candidate.posterUrl ||
      candidate.thumbnails?.heroUrl ||
      candidate.thumbnails?.storyboardUrl,
  );
}

function hasDirectUrl(candidate: MediaCandidate): boolean {
  return Boolean(candidate.sourceUrl || candidate.blobUrl);
}

function hasManifestUrl(candidate: MediaCandidate): boolean {
  return Boolean(candidate.manifestUrl || candidate.sourceUrl);
}

export function resolveBrowserDownloadCapability(
  input: ResolveBrowserDownloadCapabilityInput,
): BrowserCapabilityResult {
  const { candidate, selection, allowBrowserRecording } = input;
  const enableBrowserFallbacks = input.enableBrowserFallbacks ?? true;

  if (isBlockedProtection(candidate)) {
    return protectedResult();
  }

  if (candidate.protocol === 'direct') {
    if (!hasDirectUrl(candidate)) {
      return unsupported('Direct browser download requires a source URL.');
    }

    if (hasTrim(selection)) {
      if (!enableBrowserFallbacks && selection?.outputKind === 'webm') {
        return browserFallbackDisabled();
      }

      if (allowBrowserRecording) {
        return {
          available: true,
          capability: 'direct-webm-recording',
          outputExtension: 'webm',
          outputMimeType: 'video/webm',
        };
      }

      return nativeRequired('Original-quality direct trim requires the native helper.');
    }

    return {
      available: true,
      capability: 'direct-download',
      outputExtension: candidate.fileExtensionHint,
      outputMimeType: candidate.mimeType,
    };
  }

  if (candidate.protocol === 'hls') {
    if (!enableBrowserFallbacks) {
      return browserFallbackDisabled();
    }

    if (!hasManifestUrl(candidate)) {
      return unsupported('HLS browser export requires a manifest URL.');
    }

    if (input.browserTransmuxWithMuxJs === false) {
      return nativeRequired('HLS downloads must produce playable MP4 output; enable mux.js or native FFmpeg export.');
    }

    return {
      available: true,
      capability: 'hls-muxjs-mp4',
      outputExtension: 'mp4',
      outputMimeType: 'video/mp4',
    };
  }

  if (candidate.protocol === 'dash') {
    if (!enableBrowserFallbacks) {
      return browserFallbackDisabled();
    }

    if (!hasManifestUrl(candidate)) {
      return unsupported('DASH browser export requires a manifest URL.');
    }

    return {
      available: true,
      capability: 'dash-raw-segments',
      outputExtension: 'bin',
      outputMimeType: 'application/octet-stream',
    };
  }

  return unsupported(`Browser download is unavailable for ${candidate.protocol} media.`);
}

export function resolveBrowserPreviewCapability(
  candidate: MediaCandidate,
  options: ResolveBrowserAssetCapabilityOptions = {},
): BrowserCapabilityResult {
  if (isBlockedProtection(candidate)) {
    return protectedResult();
  }

  if (candidate.protocol === 'direct') {
    if (options.enableBrowserFallbacks === false) {
      return browserFallbackDisabled();
    }

    if (!hasDirectUrl(candidate)) {
      return unsupported('Direct browser preview requires a source URL.');
    }

    return {
      available: true,
      capability: 'direct-preview-recording',
      outputExtension: 'webm',
      outputMimeType: 'video/webm',
    };
  }

  if (candidate.protocol === 'hls') {
    if (options.enableBrowserFallbacks === false) {
      return browserFallbackDisabled();
    }

    if (!hasManifestUrl(candidate)) {
      return unsupported('HLS browser preview requires a manifest URL.');
    }

    return {
      available: true,
      capability: 'hls-browser-preview',
      outputMimeType: 'application/vnd.apple.mpegurl',
    };
  }

  if (candidate.protocol === 'dash' && hasStaticThumbnail(candidate)) {
    return {
      available: true,
      capability: 'static-thumbnail',
    };
  }

  if (candidate.protocol === 'dash') {
    return nativeRequired('Generated HLS and DASH previews require the native helper.');
  }

  return unsupported(`Browser preview is unavailable for ${candidate.protocol} media.`);
}

export function resolveBrowserThumbnailCapability(
  candidate: MediaCandidate,
  options: ResolveBrowserAssetCapabilityOptions = {},
): BrowserCapabilityResult {
  if (isBlockedProtection(candidate)) {
    return protectedResult();
  }

  if (hasStaticThumbnail(candidate)) {
    return {
      available: true,
      capability: 'static-thumbnail',
    };
  }

  if (candidate.protocol === 'direct') {
    if (options.enableBrowserFallbacks === false) {
      return browserFallbackDisabled();
    }

    if (!hasDirectUrl(candidate)) {
      return unsupported('Direct browser thumbnail capture requires a source URL.');
    }

    return {
      available: true,
      capability: 'direct-frame-thumbnail',
      outputExtension: 'jpg',
      outputMimeType: 'image/jpeg',
    };
  }

  if (candidate.protocol === 'hls') {
    if (options.enableBrowserFallbacks === false) {
      return browserFallbackDisabled();
    }

    if (!hasManifestUrl(candidate)) {
      return unsupported('HLS browser thumbnail capture requires a manifest URL.');
    }

    return {
      available: true,
      capability: 'hls-frame-thumbnail',
      outputExtension: 'jpg',
      outputMimeType: 'image/jpeg',
    };
  }

  if (candidate.protocol === 'dash') {
    return nativeRequired('Generated HLS and DASH thumbnails require the native helper.');
  }

  return unsupported(`Browser thumbnail capture is unavailable for ${candidate.protocol} media.`);
}
