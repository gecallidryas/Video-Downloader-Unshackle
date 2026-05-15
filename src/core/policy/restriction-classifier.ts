import type {
  CandidateRestrictionCode,
  CandidateStatus,
} from '@/video_downloader_types_skeleton';

export type RestrictionCode = CandidateRestrictionCode;

export interface RestrictionInput {
  blocked?: boolean;
  statusCode?: number;
  reason?: string;
  /** Optional free-text body/message (e.g. site playability status). */
  bodyText?: string;
  /** Optional explicit playability signal from a site detector. */
  playabilityStatus?: string;
}

export interface RestrictionResult {
  status: Extract<CandidateStatus, 'unsupported' | 'error'>;
  code: RestrictionCode;
  message: string;
  /** True when the user may choose to attempt the download anyway. */
  overridable?: boolean;
}

// Phrases that indicate region/geo unavailability across common players/APIs.
const GEO_PATTERNS = [
  /\bgeo[\s-]?(?:restricted|blocked|block|locked)\b/i,
  /not available in your (?:country|region|location)/i,
  /unavailable in your (?:country|region|location)/i,
  /\bregion[\s-]?(?:restricted|blocked|locked)\b/i,
  /\b(?:content|video) is not available in your country\b/i,
  /this video is not available in your location/i,
];

function looksGeoRestricted(input: RestrictionInput): boolean {
  if (input.statusCode === 451) return true;

  const playability = input.playabilityStatus?.toLowerCase() ?? '';
  if (playability.includes('geo') || playability.includes('region')) {
    return true;
  }

  const haystack = `${input.reason ?? ''}\n${input.bodyText ?? ''}`;
  return GEO_PATTERNS.some((pattern) => pattern.test(haystack));
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

  if (looksGeoRestricted(input)) {
    return {
      status: 'unsupported',
      code: 'geo-restricted',
      message: 'The media appears to be unavailable in this region.',
      overridable: true,
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
