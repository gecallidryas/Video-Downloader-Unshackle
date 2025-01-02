import type {
  CandidateStatus,
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
}

export interface MediaPrimaryAction {
  kind: 'download' | 'blocked';
  label: string;
  reason?: string;
}

export interface DetectedMedia {
  id: MediaCandidate['id'];
  title: MediaCandidate['displayName'];
  format: string;
  size: string;
  duration: string;
  thumbnailUrl?: string;
  mediaType: 'video' | 'audio';
  qualities: QualityOption[];
  selectedQuality: string;
  protocol?: StreamProtocol;
  status?: CandidateStatus;
  protection?: ProtectionInfo;
  primaryAction?: MediaPrimaryAction;
}
