import type { DetectionEvidence } from '@/video_downloader_types_skeleton';
import type { DomMediaElementEvidence } from './scan-media-elements';

export interface PlayerSignalScanOptions {
  now?: () => number;
}

export interface PlayerSignalScanResult {
  evidence: DetectionEvidence[];
  domEvidence: DomMediaElementEvidence[];
}

export function scanPlayerSignals(
  domEvidence: DomMediaElementEvidence[] = [],
  _options: PlayerSignalScanOptions = {},
): PlayerSignalScanResult {
  return {
    evidence: [],
    domEvidence,
  };
}
