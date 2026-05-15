import type {
  CandidateStatus,
  DownloadSelection,
  MediaCandidate,
  ProtectionInfo,
  StreamProtocol,
} from '@/video_downloader_types_skeleton';

/**
 * UI-facing media-card types.
 * These are derived from shared runtime contracts through adapters rather than
 * acting as an independent source of truth for media state.
 */

export interface QualityOption {
  label: string;
  value: string;
  url?: string;
}

export interface TrackOption {
  id: string;
  label: string;
  language?: string;
  default?: boolean;
  autoselect?: boolean;
  channels?: string;
  url?: string;
}

export interface MediaTrimSelection {
  startSec?: number;
  endSec?: number;
}

export interface MediaPrimaryAction {
  kind: 'download' | 'blocked';
  label: string;
  reason?: string;
  /** When true, the block can be lifted with an explicit inline consent. */
  overridable?: boolean;
  /** Consent kind to grant before retrying the download. */
  consentKind?: 'protected' | 'geo';
}

export interface DetectedMedia {
  id: MediaCandidate['id'];
  title: MediaCandidate['displayName'];
  format: string;
  categoryLabel?: string;
  size: string;
  duration: string;
  url?: string;
  thumbnailUrl?: string;
  previewAssetUrl?: string;
  previewLoading?: boolean;
  mediaType: 'video' | 'audio';
  bitrate?: number;
  durationSec?: number;
  fps?: number;
  channels?: string;
  default?: boolean;
  autoselect?: boolean;
  qualities: QualityOption[];
  selectedQuality: string;
  audioTracks?: TrackOption[];
  selectedAudioTrackIds?: string[];
  subtitleTracks?: TrackOption[];
  selectedSubtitleTrackIds?: string[];
  selectedSubtitleOutput?: NonNullable<DownloadSelection['subtitleOutput']>;
  trim?: MediaTrimSelection | null;
  protocol?: StreamProtocol;
  status?: CandidateStatus;
  protection?: ProtectionInfo;
  previewUnavailableReason?: string;
  thumbnailUnavailableReason?: string;
  primaryAction?: MediaPrimaryAction;
}
