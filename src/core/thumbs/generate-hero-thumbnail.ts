import type { DownloadPhase, MediaCandidate } from '@/video_downloader_types_skeleton';

export interface HeroThumbnailJob {
  id: string;
  kind: 'hero-thumbnail';
  candidateId: string;
  tabId: number;
  phase: Extract<DownloadPhase, 'queued'>;
  createdAt: number;
  updatedAt: number;
}

export interface CreateHeroThumbnailJobOptions {
  now?: () => number;
}

export function createHeroThumbnailJob(
  candidate: MediaCandidate,
  options: CreateHeroThumbnailJobOptions = {},
): HeroThumbnailJob {
  const now = options.now ?? Date.now;
  const timestamp = now();

  return {
    id: `thumb-${candidate.id}-${timestamp}`,
    kind: 'hero-thumbnail',
    candidateId: candidate.id,
    tabId: candidate.tabId,
    phase: 'queued',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
