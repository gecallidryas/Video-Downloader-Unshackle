import type {
  DownloadSelection,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';

export type BrowserExportCapability =
  | 'direct-download'
  | 'direct-webm-recording'
  | 'hls-raw-ts'
  | 'dash-raw-segments'
  | 'static-thumbnail'
  | 'direct-frame-thumbnail'
  | 'direct-preview-recording'
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
    candidate.protection.kind === 'unknown' ||
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

  if (isBlockedProtection(candidate)) {
    return protectedResult();
  }

  if (candidate.protocol === 'direct') {
    if (!hasDirectUrl(candidate)) {
      return unsupported('Direct browser download requires a source URL.');
    }

    if (hasTrim(selection)) {
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
    if (!hasManifestUrl(candidate)) {
      return unsupported('HLS browser export requires a manifest URL.');
    }

    return {
      available: true,
      capability: 'hls-raw-ts',
      outputExtension: 'ts',
      outputMimeType: 'video/mp2t',
    };
  }

  if (candidate.protocol === 'dash') {
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
): BrowserCapabilityResult {
  if (isBlockedProtection(candidate)) {
    return protectedResult();
  }

  if (candidate.protocol === 'direct') {
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

  if (
    (candidate.protocol === 'hls' || candidate.protocol === 'dash') &&
    hasStaticThumbnail(candidate)
  ) {
    return {
      available: true,
      capability: 'static-thumbnail',
    };
  }

  if (candidate.protocol === 'hls' || candidate.protocol === 'dash') {
    return nativeRequired('Generated HLS and DASH previews require the native helper.');
  }

  return unsupported(`Browser preview is unavailable for ${candidate.protocol} media.`);
}

export function resolveBrowserThumbnailCapability(
  candidate: MediaCandidate,
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

  if (candidate.protocol === 'hls' || candidate.protocol === 'dash') {
    return nativeRequired('Generated HLS and DASH thumbnails require the native helper.');
  }

  return unsupported(`Browser thumbnail capture is unavailable for ${candidate.protocol} media.`);
}
