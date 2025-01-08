import { describe, expect, test } from 'vitest';
import type { DetectionEvidence } from '@/video_downloader_types_skeleton';
import { classifyProtection } from '../classify-protection';

function evidence(overrides: Partial<DetectionEvidence>): DetectionEvidence {
  return {
    source: 'network',
    confidence: 0.75,
    createdAt: 100,
    ...overrides,
  };
}

describe('classifyProtection', () => {
  test('classifies clear evidence as no protection', () => {
    expect(
      classifyProtection([
        evidence({
          url: 'https://cdn.example.com/video.mp4',
          notes: ['category:direct_media'],
        }),
      ]),
    ).toEqual({ kind: 'none' });
  });

  test('recognizes AES-128 style clear-key markers', () => {
    expect(
      classifyProtection([
        evidence({
          url: 'https://cdn.example.com/master.m3u8',
          notes: ['hls-key-method:AES-128', 'key-uri:https://keys.example.com/key'],
        }),
      ]),
    ).toEqual({
      kind: 'aes-128',
      method: 'AES-128',
      keyUri: 'https://keys.example.com/key',
      reason: 'Detected HLS clear-key encryption marker.',
    });
  });

  test('marks DRM evidence as protected instead of ready', () => {
    expect(
      classifyProtection([
        evidence({
          url: 'https://cdn.example.com/manifest.mpd',
          notes: ['drm:widevine', 'content-protection:cenc'],
        }),
      ]),
    ).toEqual({
      kind: 'drm',
      reason: 'Detected DRM or protected-media marker in evidence.',
      drmSystems: ['widevine'],
    });
  });

  test('returns unknown for ambiguous protection markers', () => {
    expect(
      classifyProtection([
        evidence({
          url: 'https://cdn.example.com/stream',
          notes: ['content-protection:unknown'],
        }),
      ]),
    ).toEqual({
      kind: 'unknown',
      reason: 'Detected protection marker that could not be classified.',
    });
  });
});
