import type { MediaCandidate } from '@/video_downloader_types_skeleton';

export interface CandidateActionPolicy {
  canDownload: boolean;
  canCopyUrl: boolean;
  reasonCode?: 'protected-media' | 'unsupported' | 'missing-url';
  message?: string;
}

export function getCandidateActionPolicy(
  candidate: MediaCandidate,
): CandidateActionPolicy {
  if (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'unknown' ||
    candidate.protection.kind === 'sample-aes'
  ) {
    return {
      canDownload: false,
      canCopyUrl: Boolean(candidate.sourceUrl ?? candidate.manifestUrl),
      reasonCode: 'protected-media',
      message: 'Protected media cannot be downloaded by the generic pipeline.',
    };
  }

  if (candidate.status === 'unsupported' || candidate.status === 'error') {
    return {
      canDownload: false,
      canCopyUrl: Boolean(candidate.sourceUrl ?? candidate.manifestUrl),
      reasonCode: 'unsupported',
      message: 'This media candidate is not supported for download.',
    };
  }

  if (!candidate.sourceUrl && !candidate.manifestUrl) {
    return {
      canDownload: false,
      canCopyUrl: false,
      reasonCode: 'missing-url',
      message: 'No downloadable URL is available for this candidate.',
    };
  }

  return {
    canDownload: true,
    canCopyUrl: true,
  };
}
