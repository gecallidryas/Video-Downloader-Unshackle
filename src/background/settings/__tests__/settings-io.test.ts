import { describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings-store';
import { exportSettings, importSettings } from '../settings-io';

describe('settings I/O', () => {
  test('exports user-facing settings while stripping internal secrets', () => {
    const exported = exportSettings({
      ...DEFAULT_SETTINGS,
      advancedMode: true,
      captureCredentialHeaders: true,
      _someInternalToken: 'secret-value',
      _headerProfile: { authorization: 'Bearer secret' },
    });
    const parsed = JSON.parse(exported);

    expect(parsed.advancedMode).toBe(true);
    expect(parsed.captureCredentialHeaders).toBe(true);
    expect(parsed._schemaVersion).toBe(DEFAULT_SETTINGS._schemaVersion);
    expect(parsed._exportedAt).toEqual(expect.any(String));
    expect(parsed._someInternalToken).toBeUndefined();
    expect(parsed._headerProfile).toBeUndefined();
  });

  test('imports settings with current version validation', () => {
    const json = JSON.stringify({
      advancedMode: false,
      segmentTimeoutMs: 45_000,
      _schemaVersion: DEFAULT_SETTINGS._schemaVersion,
    });

    const result = importSettings(json);

    expect(result).toEqual({
      valid: true,
      settings: {
        advancedMode: false,
        segmentTimeoutMs: 45_000,
        _schemaVersion: DEFAULT_SETTINGS._schemaVersion,
      },
    });
  });

  test('accepts older schema versions as partial current settings', () => {
    const result = importSettings(JSON.stringify({
      preferredQuality: '720p',
      _schemaVersion: DEFAULT_SETTINGS._schemaVersion - 1,
    }));

    expect(result.valid).toBe(true);
    if (!result.valid) {
      throw new Error(result.error);
    }
    expect(result.settings).toEqual({
      preferredQuality: '720p',
      _schemaVersion: DEFAULT_SETTINGS._schemaVersion - 1,
    });
  });

  test('rejects settings from future schema version', () => {
    const result = importSettings(JSON.stringify({
      _schemaVersion: DEFAULT_SETTINGS._schemaVersion + 1,
    }));

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('Expected future schema import to fail.');
    }
    expect(result.error).toContain('version');
  });

  test('rejects invalid JSON structure', () => {
    expect(importSettings('{').valid).toBe(false);
    expect(importSettings('[]').valid).toBe(false);
  });
});
