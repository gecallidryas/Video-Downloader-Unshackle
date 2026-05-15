import type { CandidateRestriction } from '@/video_downloader_types_skeleton';
import { classifyRestriction } from '@/src/core/policy/restriction-classifier';

// Thrown by the manifest fetcher when the response is not ok, carrying the HTTP
// status and a bounded body slice so a geo/access restriction can be classified
// at the candidate layer (rather than swallowed as a generic failure).
export class ManifestFetchError extends Error {
  readonly statusCode?: number;
  readonly bodyText?: string;

  constructor(
    message: string,
    options: { statusCode?: number; bodyText?: string } = {},
  ) {
    super(message);
    this.name = 'ManifestFetchError';
    this.statusCode = options.statusCode;
    this.bodyText = options.bodyText;
  }
}

// Maps a failed manifest fetch to a candidate restriction. Returns undefined for
// non-ManifestFetchError causes (e.g. parse failures) and for statuses that do
// not classify as a restriction, leaving the candidate unchanged.
export function candidateRestrictionFromError(
  error: unknown,
): CandidateRestriction | undefined {
  if (!(error instanceof ManifestFetchError)) {
    return undefined;
  }

  const result = classifyRestriction({
    statusCode: error.statusCode,
    bodyText: error.bodyText,
  });

  if (!result) {
    return undefined;
  }

  return {
    code: result.code,
    message: result.message,
    ...(result.overridable ? { overridable: true } : {}),
  };
}
