import type { MediaCandidate } from '@/video_downloader_types_skeleton';

export interface DirectMediaProbe {
  url: string;
  fileName: string;
  mimeType: string;
}

function getFileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const fileName = pathname.split('/').filter(Boolean).pop();

    return decodeURIComponent(fileName || 'download');
  } catch {
    return url.split('/').filter(Boolean).pop() ?? 'download';
  }
}

export function probeDirectMedia(candidate: MediaCandidate): DirectMediaProbe {
  if (candidate.protocol !== 'direct' || !candidate.sourceUrl) {
    throw new Error('Only direct media candidates can be probed.');
  }

  return {
    url: candidate.sourceUrl,
    fileName: getFileNameFromUrl(candidate.sourceUrl),
    mimeType: candidate.mimeType ?? 'application/octet-stream',
  };
}
