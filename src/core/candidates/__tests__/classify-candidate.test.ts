import { describe, expect, test } from 'vitest';
import type { DetectionEvidence } from '@/video_downloader_types_skeleton';
import type { DomMediaElementEvidence } from '@/src/content/dom/scan-media-elements';
import type { NetworkRequestEvidence } from '@/src/background/network/request-journal';
import { createCandidateRegistry } from '@/src/background/candidates/candidate-registry';
import { classifyCandidate } from '../classify-candidate';
import { mergeCandidateEvidence } from '../merge-candidate-evidence';

function baseDetectionEvidence(
  overrides: Partial<DetectionEvidence>,
): DetectionEvidence {
  return {
    source: 'network',
    confidence: 0.75,
    createdAt: 100,
    ...overrides,
  };
}

function networkEvidence(
  overrides: Partial<NetworkRequestEvidence>,
): NetworkRequestEvidence {
  const url = overrides.url ?? 'https://cdn.example.com/video.mp4';
  const category = overrides.category ?? 'direct_media';

  return {
    tabId: 7,
    category,
    protocol: overrides.protocol ?? 'direct',
    mediaKind: overrides.mediaKind ?? 'video',
    url,
    initiatorUrl: 'https://example.com/watch',
    fileExtensionHint: 'mp4',
    evidence: baseDetectionEvidence({
      url,
      initiatorUrl: 'https://example.com/watch',
      notes: [`category:${category}`],
    }),
    detectedAt: 100,
    ...overrides,
  };
}

function domEvidence(
  overrides: Partial<DomMediaElementEvidence>,
): DomMediaElementEvidence {
  const url = overrides.url ?? 'https://cdn.example.com/video.mp4';

  return {
    source: 'dom',
    confidence: 0.85,
    url,
    elementSelector: 'video#hero',
    notes: ['tag:video'],
    createdAt: 90,
    mediaKind: 'video',
    pageUrl: 'https://example.com/watch',
    pageTitle: 'Example page',
    posterUrl: 'https://example.com/poster.jpg',
    width: 1280,
    height: 720,
    durationSec: 60,
    sources: [{ url, mimeType: 'video/mp4' }],
    tracks: [],
    ...overrides,
  };
}

describe('classifyCandidate', () => {
  test('normalizes direct DOM and network evidence into a ready MediaCandidate', () => {
    const candidate = classifyCandidate({
      tabId: 7,
      pageUrl: 'https://example.com/watch',
      pageTitle: 'Example page',
      evidence: [
        domEvidence({}),
        networkEvidence({
          mimeType: 'video/mp4',
          fileExtensionHint: 'mp4',
        }),
      ],
      now: () => 200,
    });

    expect(candidate).toMatchObject({
      tabId: 7,
      mediaKind: 'video',
      protocol: 'direct',
      status: 'ready',
      pageUrl: 'https://example.com/watch',
      pageTitle: 'Example page',
      origin: 'https://example.com',
      displayName: 'video.mp4',
      sourceUrl: 'https://cdn.example.com/video.mp4',
      posterUrl: 'https://example.com/poster.jpg',
      mimeType: 'video/mp4',
      fileExtensionHint: 'mp4',
      durationSec: 60,
      width: 1280,
      height: 720,
      protection: { kind: 'none' },
      preview: { playable: true, adapter: 'native' },
      createdAt: 200,
      updatedAt: 200,
    });
    expect(candidate.evidence).toHaveLength(2);
  });

  test('prefers detector-provided titles over URL filenames', () => {
    const candidate = classifyCandidate({
      tabId: 7,
      pageUrl: 'https://example.com/watch',
      evidence: [
        networkEvidence({
          url: 'https://cdn.example.com/video.mp4',
          evidence: baseDetectionEvidence({
            url: 'https://cdn.example.com/video.mp4',
            notes: ['category:direct_media', 'title:Episode 4'],
          }),
        }),
      ],
      now: () => 250,
    });

    expect(candidate.displayName).toBe('Episode 4');
  });

  test('uses player-config metadata for manifest candidates', () => {
    const candidate = classifyCandidate({
      tabId: 7,
      pageUrl: 'https://example.com/watch',
      evidence: [
        baseDetectionEvidence({
          source: 'player-config',
          url: 'https://cdn.example.com/master.m3u8',
          notes: [
            'protocol:hls',
            'title:Launch Event',
            'thumbnail-url:https://cdn.example.com/thumb.jpg',
            'resolution:720p',
            'bitrate:2400000',
          ],
        }),
      ],
      now: () => 275,
    });

    expect(candidate).toMatchObject({
      protocol: 'hls',
      manifestUrl: 'https://cdn.example.com/master.m3u8',
      displayName: 'Launch Event',
      thumbnails: {
        heroUrl: 'https://cdn.example.com/thumb.jpg',
      },
      variants: [
        expect.objectContaining({
          height: 720,
          bitrate: 2400000,
          isDefault: true,
        }),
      ],
    });
  });

  test('normalizes HLS and DASH manifest evidence into partial candidates', () => {
    const hlsCandidate = classifyCandidate({
      tabId: 7,
      pageUrl: 'https://example.com/watch',
      evidence: [
        networkEvidence({
          category: 'hls_manifest',
          protocol: 'hls',
          url: 'https://cdn.example.com/master.m3u8',
          fileExtensionHint: 'm3u8',
          evidence: baseDetectionEvidence({
            url: 'https://cdn.example.com/master.m3u8',
            notes: ['category:hls_manifest'],
          }),
        }),
      ],
      now: () => 300,
    });
    const dashCandidate = classifyCandidate({
      tabId: 7,
      pageUrl: 'https://example.com/watch',
      evidence: [
        networkEvidence({
          category: 'dash_manifest',
          protocol: 'dash',
          url: 'https://cdn.example.com/manifest.mpd',
          fileExtensionHint: 'mpd',
          evidence: baseDetectionEvidence({
            url: 'https://cdn.example.com/manifest.mpd',
            notes: ['category:dash_manifest'],
          }),
        }),
      ],
      now: () => 300,
    });

    expect(hlsCandidate).toMatchObject({
      protocol: 'hls',
      status: 'partial',
      manifestUrl: 'https://cdn.example.com/master.m3u8',
      protection: { kind: 'none' },
      preview: { playable: false, adapter: 'none' },
    });
    expect(dashCandidate).toMatchObject({
      protocol: 'dash',
      status: 'partial',
      manifestUrl: 'https://cdn.example.com/manifest.mpd',
      protection: { kind: 'none' },
      preview: { playable: false, adapter: 'none' },
    });
  });

  test('keeps DRM/protected candidates blocked from the generic ready state', () => {
    const candidate = classifyCandidate({
      tabId: 7,
      pageUrl: 'https://example.com/watch',
      evidence: [
        networkEvidence({
          category: 'dash_manifest',
          protocol: 'dash',
          url: 'https://cdn.example.com/protected.mpd',
          evidence: baseDetectionEvidence({
            url: 'https://cdn.example.com/protected.mpd',
            notes: ['category:dash_manifest', 'drm:widevine'],
          }),
        }),
      ],
      now: () => 400,
    });

    expect(candidate.status).toBe('protected');
    expect(candidate.protection.kind).toBe('drm');
    expect(candidate.preview).toEqual({ playable: false, adapter: 'none' });
  });

  test('does not force unknown protection into the protected status', () => {
    const candidate = classifyCandidate({
      tabId: 7,
      pageUrl: 'https://example.com/watch',
      evidence: [
        networkEvidence({
          category: 'hls_manifest',
          protocol: 'hls',
          url: 'https://cdn.example.com/unknown.m3u8',
          evidence: baseDetectionEvidence({
            url: 'https://cdn.example.com/unknown.m3u8',
            notes: ['category:hls_manifest', 'encrypted:unknown'],
          }),
        }),
      ],
      now: () => 450,
    });

    expect(candidate.protection.kind).toBe('unknown');
    expect(candidate.status).toBe('partial');
    expect(candidate.preview).toEqual({ playable: false, adapter: 'none' });
  });
});

describe('mergeCandidateEvidence', () => {
  test('merges direct, HLS, and DASH evidence into normalized candidates', () => {
    const candidates = mergeCandidateEvidence({
      tabId: 7,
      pageUrl: 'https://example.com/watch',
      evidence: [
        domEvidence({ url: 'https://cdn.example.com/direct.mp4' }),
        networkEvidence({
          url: 'https://cdn.example.com/master.m3u8',
          category: 'hls_manifest',
          protocol: 'hls',
          fileExtensionHint: 'm3u8',
          evidence: baseDetectionEvidence({
            url: 'https://cdn.example.com/master.m3u8',
            notes: ['category:hls_manifest'],
          }),
        }),
        networkEvidence({
          url: 'https://cdn.example.com/manifest.mpd',
          category: 'dash_manifest',
          protocol: 'dash',
          fileExtensionHint: 'mpd',
          evidence: baseDetectionEvidence({
            url: 'https://cdn.example.com/manifest.mpd',
            notes: ['category:dash_manifest'],
          }),
        }),
      ],
      now: () => 500,
    });

    expect(candidates.map((candidate) => candidate.protocol)).toEqual([
      'direct',
      'hls',
      'dash',
    ]);
  });

  test('candidate registry can store normalized candidates from evidence', () => {
    const registry = createCandidateRegistry();

    const candidates = registry.setFromEvidence({
      tabId: 7,
      pageUrl: 'https://example.com/watch',
      evidence: [domEvidence({})],
      now: () => 600,
    });

    expect(candidates).toHaveLength(1);
    expect(registry.get(7)[0]).toMatchObject({
      protocol: 'direct',
      status: 'ready',
      sourceUrl: 'https://cdn.example.com/video.mp4',
    });
  });
});
