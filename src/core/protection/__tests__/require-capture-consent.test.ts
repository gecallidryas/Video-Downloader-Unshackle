import { describe, expect, test } from 'vitest';
import type { ProtectionInfo } from '@/video_downloader_types_skeleton';
import { requireCaptureConsent } from '../require-capture-consent';

describe('requireCaptureConsent', () => {
  test('allows capture for unprotected content (kind: none)', () => {
    const protection: ProtectionInfo = { kind: 'none' };
    expect(requireCaptureConsent(protection)).toEqual({ allowed: true });
  });

  test('allows capture for clear-key AES-128 content', () => {
    const protection: ProtectionInfo = {
      kind: 'aes-128',
      method: 'AES-128',
      keyUri: 'https://keys.example.com/key',
      reason: 'Detected HLS clear-key encryption marker.',
    };
    expect(requireCaptureConsent(protection)).toEqual({ allowed: true });
  });

  test('blocks capture for DRM-protected content with user-facing reason', () => {
    const protection: ProtectionInfo = {
      kind: 'drm',
      reason: 'Detected DRM or protected-media marker in evidence.',
      drmSystems: ['widevine'],
    };
    const result = requireCaptureConsent(protection);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toMatch(/DRM-protected/);
      expect(result.reason).toMatch(/unusable output/);
    }
  });

  test('blocks capture for SAMPLE-AES content with user-facing reason', () => {
    const protection: ProtectionInfo = {
      kind: 'sample-aes',
      method: 'SAMPLE-AES',
      reason: 'Detected HLS DRM-style SAMPLE-AES encryption marker.',
    };
    const result = requireCaptureConsent(protection);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toMatch(/SAMPLE-AES/);
      expect(result.reason).toMatch(/unusable output/);
    }
  });

  test('blocks capture for unknown protection with user-facing reason', () => {
    const protection: ProtectionInfo = {
      kind: 'unknown',
      reason: 'Detected protection marker that could not be classified.',
    };
    const result = requireCaptureConsent(protection);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toMatch(/unrecognised protection/);
      expect(result.reason).toMatch(/unusable output/);
    }
  });

  test('all five ProtectionKind values are handled', () => {
    const kinds: ProtectionInfo['kind'][] = [
      'none',
      'aes-128',
      'drm',
      'sample-aes',
      'unknown',
    ];

    for (const kind of kinds) {
      const result = requireCaptureConsent({ kind } as ProtectionInfo);
      expect(result).toHaveProperty('allowed');
      if (!result.allowed) {
        expect(result.reason).toBeTruthy();
      }
    }
  });

  test('allowed kinds return exactly { allowed: true } with no extra fields', () => {
    const allowedKinds: ProtectionInfo['kind'][] = ['none', 'aes-128'];
    for (const kind of allowedKinds) {
      const result = requireCaptureConsent({ kind } as ProtectionInfo);
      expect(result).toStrictEqual({ allowed: true });
    }
  });

  test('blocked kinds always include a non-empty reason string', () => {
    const blockedKinds: ProtectionInfo['kind'][] = ['drm', 'sample-aes', 'unknown'];
    for (const kind of blockedKinds) {
      const result = requireCaptureConsent({ kind } as ProtectionInfo);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(typeof result.reason).toBe('string');
        expect(result.reason.length).toBeGreaterThan(0);
      }
    }
  });
});
