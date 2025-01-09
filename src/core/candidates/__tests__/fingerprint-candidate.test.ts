import { describe, expect, test } from 'vitest';
import type { DetectionEvidence } from '@/video_downloader_types_skeleton';
import type { NetworkRequestEvidence } from '@/src/background/network/request-journal';
import { createCandidateFingerprint } from '../fingerprint-candidate';
import { mergeCandidateEvidence } from '../merge-candidate-evidence';

function detectionEvidence(
  overrides: Partial<DetectionEvidence>,
): DetectionEvidence {
  return {
    source: 'network',
    confidence: 0.75,
    createdAt: 1,
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
    initiatorUrl: overrides.initiatorUrl ?? 'https://example.com/watch',
    evidence: detectionEvidence({
      url,
      initiatorUrl: overrides.initiatorUrl ?? 'https://example.com/watch',
      notes: [`category:${category}`],
    }),
    detectedAt: 1,
    ...overrides,
  };
}

describe('createCandidateFingerprint', () => {
  test('uses the same key for identical direct media across DOM and network evidence', () => {
    const networkKey = createCandidateFingerprint({
      pageUrl: 'https://example.com/watch',
      evidence: networkEvidence({
        url: 'https://cdn.example.com/movie.mp4#fragment',
      }),
    });
    const domKey = createCandidateFingerprint({
      pageUrl: 'https://example.com/watch',
      evidence: detectionEvidence({
        source: 'dom',
        url: 'https://cdn.example.com/movie.mp4',
        notes: ['protocol:direct'],
      }),
    });

    expect(networkKey).toBe(domKey);
  });

  test('groups HLS variant evidence by master manifest URL', () => {
    const masterKey = createCandidateFingerprint({
      pageUrl: 'https://example.com/watch',
      evidence: networkEvidence({
        category: 'hls_manifest',
        protocol: 'hls',
        url: 'https://cdn.example.com/master.m3u8',
      }),
    });
    const variantKey = createCandidateFingerprint({
      pageUrl: 'https://example.com/watch',
      evidence: detectionEvidence({
        source: 'player-config',
        url: 'https://cdn.example.com/720p.m3u8',
        notes: [
          'protocol:hls',
          'manifest-url:https://cdn.example.com/master.m3u8',
          'variant-id:720p',
        ],
      }),
    });

    expect(variantKey).toBe(masterKey);
  });

  test('keeps DASH representations from the same MPD as distinct quality candidates', () => {
    const high = createCandidateFingerprint({
      pageUrl: 'https://example.com/watch',
      evidence: detectionEvidence({
        source: 'player-config',
        url: 'https://cdn.example.com/video-1080.m4s',
        notes: [
          'protocol:dash',
          'manifest-url:https://cdn.example.com/manifest.mpd',
          'representation-id:v1080',
          'resolution:1080p',
          'bitrate:5000000',
        ],
      }),
    });
    const low = createCandidateFingerprint({
      pageUrl: 'https://example.com/watch',
      evidence: detectionEvidence({
        source: 'player-config',
        url: 'https://cdn.example.com/video-720.m4s',
        notes: [
          'protocol:dash',
          'manifest-url:https://cdn.example.com/manifest.mpd',
          'representation-id:v720',
          'resolution:720p',
          'bitrate:2500000',
        ],
      }),
    });

    expect(high).not.toBe(low);
  });
});

describe('mergeCandidateEvidence fingerprint grouping', () => {
  test('merges HLS master and variant evidence into one candidate', () => {
    const candidates = mergeCandidateEvidence({
      tabId: 7,
      pageUrl: 'https://example.com/watch',
      evidence: [
        networkEvidence({
          category: 'hls_manifest',
          protocol: 'hls',
          url: 'https://cdn.example.com/master.m3u8',
          evidence: detectionEvidence({
            url: 'https://cdn.example.com/master.m3u8',
            notes: ['category:hls_manifest'],
          }),
        }),
        detectionEvidence({
          source: 'player-config',
          url: 'https://cdn.example.com/720p.m3u8',
          notes: [
            'protocol:hls',
            'manifest-url:https://cdn.example.com/master.m3u8',
            'variant-id:720p',
            'resolution:720p',
          ],
        }),
      ],
      now: () => 10,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      protocol: 'hls',
      manifestUrl: 'https://cdn.example.com/master.m3u8',
      variants: [{ id: '720p', height: 720 }],
    });
  });

  test('keeps DASH quality representations as separate candidates', () => {
    const candidates = mergeCandidateEvidence({
      tabId: 7,
      pageUrl: 'https://example.com/watch',
      evidence: [
        networkEvidence({
          category: 'dash_manifest',
          protocol: 'dash',
          url: 'https://cdn.example.com/manifest.mpd',
          evidence: detectionEvidence({
            url: 'https://cdn.example.com/manifest.mpd',
            notes: ['category:dash_manifest'],
          }),
        }),
        detectionEvidence({
          source: 'player-config',
          url: 'https://cdn.example.com/video-1080.m4s',
          notes: [
            'protocol:dash',
            'manifest-url:https://cdn.example.com/manifest.mpd',
            'representation-id:v1080',
            'resolution:1080p',
          ],
        }),
        detectionEvidence({
          source: 'player-config',
          url: 'https://cdn.example.com/video-720.m4s',
          notes: [
            'protocol:dash',
            'manifest-url:https://cdn.example.com/manifest.mpd',
            'representation-id:v720',
            'resolution:720p',
          ],
        }),
      ],
      now: () => 10,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.variants[0]?.id).sort()).toEqual([
      'v1080',
      'v720',
    ]);
  });
});
