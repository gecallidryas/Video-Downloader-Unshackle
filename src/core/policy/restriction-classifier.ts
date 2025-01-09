import type { CandidateStatus } from '@/video_downloader_types_skeleton';

export type RestrictionCode =
  | 'blocked-site'
  | 'geo-restricted'
  | 'access-restricted'
  | 'rate-limited'
  | 'unknown-restriction';

export interface RestrictionInput {
  blocked?: boolean;
  statusCode?: number;
  reason?: string;
}

export interface RestrictionResult {
  status: Extract<CandidateStatus, 'unsupported' | 'error'>;
  code: RestrictionCode;
  message: string;
}

export function classifyRestriction(
  input: RestrictionInput,
): RestrictionResult | undefined {
  if (input.blocked) {
    return {
      status: 'unsupported',
      code: 'blocked-site',
      message: input.reason ?? 'This URL is blocked by detection policy.',
    };
  }

  if (input.statusCode === 451) {
    return {
      status: 'unsupported',
      code: 'geo-restricted',
      message: 'The media appears to be unavailable in this region.',
    };
  }

  if (input.statusCode === 401 || input.statusCode === 403) {
    return {
      status: 'unsupported',
      code: 'access-restricted',
      message: 'The media requires access that the extension cannot use safely.',
    };
  }

  if (input.statusCode === 429) {
    return {
      status: 'error',
      code: 'rate-limited',
      message: 'The media host is rate limiting requests.',
    };
  }

  return undefined;
}
