import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import type { RestrictionConsentKind } from './restriction-consent';

export interface CandidateActionPolicy {
  canDownload: boolean;
  canCopyUrl: boolean;
  reasonCode?: 'protected-media' | 'geo-restricted' | 'unsupported' | 'missing-url';
  message?: string;
  /** True when the block can be lifted by explicit user consent (inline override). */
  overridable?: boolean;
  /** The consent kind the user must grant to unblock this candidate. */
  consentKind?: RestrictionConsentKind;
}

export interface ActionPolicyContext {
  /** Consent kinds the user has explicitly granted for this candidate. */
  grantedConsents?: readonly RestrictionConsentKind[];
  /**
   * Global default. When explicitly `false`, protected media is not suppressed
   * (legacy global override). Per-candidate consent overrides this either way.
   */
  suppressProtectedDownloads?: boolean;
}

function isProtectedCandidate(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'unknown' ||
    candidate.protection.kind === 'sample-aes'
  );
}

function hasConsent(
  context: ActionPolicyContext,
  kind: RestrictionConsentKind,
): boolean {
  return context.grantedConsents?.includes(kind) ?? false;
}

export function getCandidateActionPolicy(
  candidate: MediaCandidate,
  context: ActionPolicyContext = {},
): CandidateActionPolicy {
  const canCopyUrl = Boolean(candidate.sourceUrl ?? candidate.manifestUrl);

  if (isProtectedCandidate(candidate)) {
    const allowed =
      hasConsent(context, 'protected') ||
      context.suppressProtectedDownloads === false;

    if (!allowed) {
      return {
        canDownload: false,
        canCopyUrl,
        reasonCode: 'protected-media',
        message:
          'This media is protected. You can choose to download it anyway.',
        overridable: true,
        consentKind: 'protected',
      };
    }
  }

  const isGeo = candidate.restriction?.code === 'geo-restricted';
  if (isGeo && !hasConsent(context, 'geo')) {
    return {
      canDownload: false,
      canCopyUrl,
      reasonCode: 'geo-restricted',
      message:
        candidate.restriction?.message ??
        'This media appears unavailable in your region. You can try downloading it anyway.',
      overridable: true,
      consentKind: 'geo',
    };
  }

  // A consented geo candidate keeps its 'unsupported' status; the geo branch
  // above owns that decision, so skip the generic unsupported block for it.
  if (!isGeo && (candidate.status === 'unsupported' || candidate.status === 'error')) {
    return {
      canDownload: false,
      canCopyUrl,
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
