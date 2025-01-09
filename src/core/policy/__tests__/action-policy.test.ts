import { describe, expect, test } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { getCandidateActionPolicy } from '../action-policy';
import { evaluateScanPermission } from '../scan-permission-policy';

function candidate(overrides: Partial<MediaCandidate>): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 1,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: 'Video',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('getCandidateActionPolicy', () => {
  test('allows ready clear media and blocks protected or restricted candidates', () => {
    expect(getCandidateActionPolicy(candidate({}))).toMatchObject({
      canDownload: true,
      canCopyUrl: true,
    });

    expect(
      getCandidateActionPolicy(
        candidate({
          status: 'protected',
          protection: { kind: 'drm', drmSystems: ['widevine'] },
        }),
      ),
    ).toMatchObject({
      canDownload: false,
      reasonCode: 'protected-media',
    });

    expect(
      getCandidateActionPolicy(candidate({ status: 'unsupported' })),
    ).toMatchObject({
      canDownload: false,
      reasonCode: 'unsupported',
    });
  });
});

describe('evaluateScanPermission', () => {
  test('requires host access and injection capability for active scans', () => {
    expect(
      evaluateScanPermission({
        origin: 'https://example.com',
        hasActiveTab: true,
        hasRuntimeHostAccess: true,
        canInject: true,
        lastCheckedAt: 1,
      }),
    ).toEqual({ canScan: true });

    expect(
      evaluateScanPermission({
        origin: 'https://example.com',
        hasActiveTab: true,
        hasRuntimeHostAccess: false,
        canInject: true,
        lastCheckedAt: 1,
      }),
    ).toMatchObject({ canScan: false, reasonCode: 'host-access-required' });
  });
});
