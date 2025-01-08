import { describe, expect, test } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import type { ProviderRegistryEntry } from '../provider-registry';
import { evaluateProviderPolicy } from '../evaluate-provider-policy';

function buildCandidate(
  overrides: Partial<MediaCandidate> = {},
): MediaCandidate {
  return {
    id: 'protected-candidate',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'dash',
    status: 'protected',
    pageUrl: 'https://watch.example.com/movie',
    pageTitle: 'Example watch page',
    origin: 'https://watch.example.com',
    displayName: 'Protected movie',
    manifestUrl: 'https://cdn.example.com/manifest.mpd',
    protection: {
      kind: 'drm',
      reason: 'Detected DRM marker.',
      drmSystems: ['widevine'],
    },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: false, adapter: 'none' },
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

const authorizedProvider: ProviderRegistryEntry = {
  id: 'authorized-example',
  providerName: 'Authorized Example',
  origins: ['https://watch.example.com'],
  actionLabel: 'Open provider workflow',
  acknowledgement:
    'I have permission to use this provider-authorized workflow.',
  getProceedUrl: (candidate) => candidate.pageUrl,
};

describe('evaluateProviderPolicy', () => {
  test('keeps protected candidates blocked by default', () => {
    expect(evaluateProviderPolicy(buildCandidate())).toEqual({
      kind: 'blocked',
      reason: 'No authorized provider workflow is registered for this origin.',
    });
  });

  test('returns an acknowledgement-gated proceed path for a matching provider registry entry', () => {
    expect(
      evaluateProviderPolicy(buildCandidate(), [authorizedProvider]),
    ).toEqual({
      kind: 'authorized-workflow',
      providerId: 'authorized-example',
      providerName: 'Authorized Example',
      actionLabel: 'Open provider workflow',
      acknowledgement:
        'I have permission to use this provider-authorized workflow.',
      proceedUrl: 'https://watch.example.com/movie',
    });
  });

  test('keeps non-matching origins blocked', () => {
    expect(
      evaluateProviderPolicy(
        buildCandidate({ origin: 'https://other.example.com' }),
        [authorizedProvider],
      ),
    ).toEqual({
      kind: 'blocked',
      reason: 'No authorized provider workflow is registered for this origin.',
    });
  });
});
