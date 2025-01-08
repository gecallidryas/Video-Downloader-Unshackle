import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  providerRegistry,
  type ProviderRegistry,
  type ProviderRegistryEntry,
} from './provider-registry';

export type ProviderPolicyResult =
  | {
      kind: 'blocked';
      reason: string;
    }
  | {
      kind: 'authorized-workflow';
      providerId: string;
      providerName: string;
      actionLabel: string;
      acknowledgement: string;
      proceedUrl: string;
    };

const noWorkflowReason =
  'No authorized provider workflow is registered for this origin.';

function normalizeOrigin(origin: string): string | undefined {
  try {
    return new URL(origin).origin;
  } catch {
    return undefined;
  }
}

function getCandidateOrigin(candidate: MediaCandidate): string | undefined {
  return normalizeOrigin(candidate.origin) ?? normalizeOrigin(candidate.pageUrl);
}

function isProtectedCandidate(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'unknown'
  );
}

function providerMatchesOrigin(
  provider: ProviderRegistryEntry,
  candidateOrigin: string | undefined,
): boolean {
  if (!candidateOrigin) {
    return false;
  }

  return provider.origins.some(
    (origin) => normalizeOrigin(origin) === candidateOrigin,
  );
}

export function evaluateProviderPolicy(
  candidate: MediaCandidate,
  registry: ProviderRegistry = providerRegistry,
): ProviderPolicyResult {
  if (!isProtectedCandidate(candidate)) {
    return {
      kind: 'blocked',
      reason: 'Provider workflows only apply to protected media candidates.',
    };
  }

  const candidateOrigin = getCandidateOrigin(candidate);
  const provider = registry.find((entry) =>
    providerMatchesOrigin(entry, candidateOrigin),
  );

  if (!provider) {
    return {
      kind: 'blocked',
      reason: noWorkflowReason,
    };
  }

  const proceedUrl = provider.getProceedUrl(candidate);

  if (!proceedUrl) {
    return {
      kind: 'blocked',
      reason: noWorkflowReason,
    };
  }

  return {
    kind: 'authorized-workflow',
    providerId: provider.id,
    providerName: provider.providerName,
    actionLabel: provider.actionLabel,
    acknowledgement: provider.acknowledgement,
    proceedUrl,
  };
}
