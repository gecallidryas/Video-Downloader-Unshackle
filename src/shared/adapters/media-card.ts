import type {
  CandidateStatus,
  AudioTrack,
  MediaCandidate,
  MediaVariant,
  ProtectionInfo,
  SubtitleTrack,
} from '@/video_downloader_types_skeleton';
import type {
  DetectedMedia,
  MediaPrimaryAction,
  QualityOption,
  TrackOption,
} from '@/src/types/media';
import {
  resolveBrowserDownloadCapability,
  resolveBrowserPreviewCapability,
  resolveBrowserThumbnailCapability,
} from '@/src/core/capabilities/browser-capabilities';
import {
  STREAM_CATEGORY_MESSAGES,
  streamCategoryMessageKey,
  type StreamCategory,
} from '@/src/i18n/stream-categories';
import { getCandidateActionPolicy } from '@/src/core/policy/action-policy';

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

  if (variant.id === 'media-playlist' || variant.id === 'default') {
    return 'Auto';
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
        url: variant.url,
      };
    }

    const detail =
      variant.bitrate != null
        ? `${Math.round(variant.bitrate / 1_000)}kbps`
        : variant.name ?? variant.id;

    return {
      label: `${label} (${detail})`,
      value: variant.id,
      url: variant.url,
    };
  });
}

function audioTrackLabel(track: AudioTrack): string {
  return track.label ?? track.language ?? track.id;
}

function subtitleTrackLabel(track: SubtitleTrack): string {
  return track.label ?? track.language ?? track.format ?? track.id;
}

function toAudioTrackOptions(tracks: MediaCandidate['audioTracks']): TrackOption[] {
  return tracks.map((track) => ({
    id: track.id,
    label: audioTrackLabel(track),
    language: track.language,
    default: track.default,
    autoselect: track.autoselect,
    channels: track.channels,
    url: track.url,
  }));
}

function toSubtitleTrackOptions(tracks: MediaCandidate['subtitleTracks']): TrackOption[] {
  return tracks.map((track) => ({
    id: track.id,
    label: subtitleTrackLabel(track),
    language: track.language,
    default: track.default,
    autoselect: track.autoselect,
    url: track.url,
  }));
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

function streamCategory(candidate: MediaCandidate): StreamCategory {
  if (candidate.mediaKind === 'subtitle') {
    return 'subtitle';
  }

  if (candidate.mediaKind === 'audio') {
    return 'audio';
  }

  if (
    candidate.protocol === 'direct' ||
    candidate.protocol === 'hls' ||
    candidate.protocol === 'dash' ||
    candidate.protocol === 'hds' ||
    candidate.protocol === 'mss'
  ) {
    return candidate.protocol;
  }

  return 'direct';
}

function getPrimaryAction(
  candidate: MediaCandidate,
): MediaPrimaryAction {
  const policy = getCandidateActionPolicy(candidate);

  if (!policy.canDownload) {
    const isGeo = policy.reasonCode === 'geo-restricted';
    return {
      kind: 'blocked',
      label: isGeo ? 'Region-locked' : 'Protected Media',
      reason: policy.message ?? candidate.protection.reason,
      ...(policy.overridable
        ? { overridable: true, consentKind: policy.consentKind }
        : {}),
    };
  }

  const capability = resolveBrowserDownloadCapability({
    candidate,
  });

  return {
    kind: 'download',
    label: 'Download',
    reason: capability.available ? undefined : capability.reason,
  };
}

export function toDetectedMedia(candidate: MediaCandidate): DetectedMedia {
  const qualities = toQualityOptions(candidate.variants);
  const selectedVariant = candidate.variants.find((variant) => variant.isDefault) ?? candidate.variants[0];
  const defaultAudio = candidate.audioTracks.find((track) => track.default) ?? candidate.audioTracks[0];
  const defaultSubtitle = candidate.subtitleTracks.find((track) => track.default);
  const mediaType = candidate.mediaKind === 'audio' ? 'audio' : 'video';
  const previewCapability = resolveBrowserPreviewCapability(candidate);
  const thumbnailCapability = resolveBrowserThumbnailCapability(candidate);
  const selectedAudioTrackIds = candidate.audioTracks
    .filter((track) => track.default)
    .map((track) => track.id);
  const selectedSubtitleTrackIds = candidate.subtitleTracks
    .filter((track) => track.default)
    .map((track) => track.id);

  return {
    id: candidate.id,
    url: selectedVariant?.url ?? candidate.sourceUrl ?? candidate.manifestUrl,
    title: candidate.displayName,
    format: formatProtocol(candidate),
    categoryLabel: STREAM_CATEGORY_MESSAGES[streamCategoryMessageKey(streamCategory(candidate))],
    size: formatSize(candidate.sizeEstimateBytes),
    duration: formatDuration(candidate.durationSec),
    thumbnailUrl: candidate.thumbnails?.heroUrl ?? candidate.posterUrl,
    mediaType,
    qualities,
    selectedQuality: getSelectedQuality(candidate.variants),
    audioTracks: toAudioTrackOptions(candidate.audioTracks),
    selectedAudioTrackIds,
    subtitleTracks: toSubtitleTrackOptions(candidate.subtitleTracks),
    selectedSubtitleTrackIds,
    selectedSubtitleOutput: selectedSubtitleTrackIds.length > 0 ? 'embed' : undefined,
    bitrate: selectedVariant?.bitrate ?? selectedVariant?.averageBitrate ?? defaultAudio?.bitrate,
    durationSec: candidate.durationSec,
    fps: selectedVariant?.frameRate,
    channels: defaultAudio?.channels,
    default: Boolean(selectedVariant?.isDefault || defaultAudio?.default || defaultSubtitle?.default),
    autoselect: Boolean(defaultAudio?.autoselect || defaultSubtitle?.autoselect),
    protocol: candidate.protocol,
    status: candidate.status,
    protection: candidate.protection,
    previewUnavailableReason: previewCapability.available
      ? undefined
      : 'Preview unavailable',
    thumbnailUnavailableReason: thumbnailCapability.available
      ? undefined
      : 'Thumbnail unavailable',
    primaryAction: getPrimaryAction(candidate),
  };
}
