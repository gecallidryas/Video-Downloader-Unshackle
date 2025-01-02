import type {
  CandidateStatus,
  MediaCandidate,
  MediaVariant,
  ProtectionInfo,
} from '@/video_downloader_types_skeleton';
import type { DetectedMedia, MediaPrimaryAction, QualityOption } from '@/src/types/media';

function formatDuration(durationSec?: number): string {
  if (durationSec == null || Number.isNaN(durationSec)) {
    return 'Unknown';
  }

  const totalSeconds = Math.max(0, Math.floor(durationSec));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatSize(sizeEstimateBytes?: number): string {
  if (sizeEstimateBytes == null || Number.isNaN(sizeEstimateBytes)) {
    return 'Unknown';
  }

  if (sizeEstimateBytes >= 1_000_000_000) {
    return `${(sizeEstimateBytes / 1_000_000_000).toFixed(1)} GB`;
  }

  if (sizeEstimateBytes >= 1_000_000) {
    return `${Math.round(sizeEstimateBytes / 1_000_000)} MB`;
  }

  if (sizeEstimateBytes >= 1_000) {
    return `${Math.round(sizeEstimateBytes / 1_000)} KB`;
  }

  return `${sizeEstimateBytes} B`;
}

function compareVariants(a: MediaVariant, b: MediaVariant): number {
  if (a.height != null && b.height != null && a.height !== b.height) {
    return b.height - a.height;
  }

  if (a.bitrate != null && b.bitrate != null && a.bitrate !== b.bitrate) {
    return b.bitrate - a.bitrate;
  }

  return a.id.localeCompare(b.id);
}

function variantLabel(variant: MediaVariant): string {
  if (variant.height != null) {
    return `${variant.height}p`;
  }

  if (variant.bitrate != null) {
    return `${Math.round(variant.bitrate / 1_000)}kbps`;
  }

  if (variant.name) {
    return variant.name;
  }

  return variant.id;
}

function toQualityOptions(variants: MediaCandidate['variants']): QualityOption[] {
  const sortedVariants = [...variants].sort(compareVariants);
  const labelCounts = new Map<string, number>();

  sortedVariants.forEach((variant) => {
    const label = variantLabel(variant);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  });

  return sortedVariants.map((variant) => {
    const label = variantLabel(variant);
    const hasCollision = (labelCounts.get(label) ?? 0) > 1;

    if (!hasCollision) {
      return {
        label,
        value: variant.id,
      };
    }

    const detail =
      variant.bitrate != null
        ? `${Math.round(variant.bitrate / 1_000)}kbps`
        : variant.name ?? variant.id;

    return {
      label: `${label} (${detail})`,
      value: variant.id,
    };
  });
}

function getSelectedQuality(
  variants: MediaCandidate['variants'],
): string {
  const preferredVariant = variants.find((variant) => variant.isDefault) ?? variants[0];

  if (!preferredVariant) {
    return '';
  }

  return preferredVariant.id;
}

function formatProtocol(candidate: MediaCandidate): string {
  if (candidate.protocol === 'direct') {
    if (candidate.fileExtensionHint) {
      return candidate.fileExtensionHint.toUpperCase();
    }

    if (candidate.mimeType?.includes('mp4')) {
      return 'MP4';
    }

    if (candidate.mimeType?.includes('webm')) {
      return 'WEBM';
    }

    if (candidate.mimeType?.includes('mpegurl')) {
      return 'HLS';
    }
  }

  return candidate.protocol.toUpperCase();
}

function getPrimaryAction(
  status: CandidateStatus,
  protection: ProtectionInfo,
): MediaPrimaryAction {
  const isBlocked = status === 'protected' || protection.kind === 'drm';

  if (isBlocked) {
    return {
      kind: 'blocked',
      label: 'Protected Media',
      reason: protection.reason,
    };
  }

  return {
    kind: 'download',
    label: 'Download',
  };
}

export function toDetectedMedia(candidate: MediaCandidate): DetectedMedia {
  const qualities = toQualityOptions(candidate.variants);
  const mediaType = candidate.mediaKind === 'audio' ? 'audio' : 'video';

  return {
    id: candidate.id,
    title: candidate.displayName,
    format: formatProtocol(candidate),
    size: formatSize(candidate.sizeEstimateBytes),
    duration: formatDuration(candidate.durationSec),
    thumbnailUrl: candidate.thumbnails?.heroUrl ?? candidate.posterUrl,
    mediaType,
    qualities,
    selectedQuality: getSelectedQuality(candidate.variants),
    protocol: candidate.protocol,
    status: candidate.status,
    protection: candidate.protection,
    primaryAction: getPrimaryAction(candidate.status, candidate.protection),
  };
}
