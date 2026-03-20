import { describe, expect, test } from 'vitest';
import { resolveEffectiveNativeFeatures } from '../native-feature-gate';

describe('resolveEffectiveNativeFeatures', () => {
  test('enabled only when setting, permission, and host availability all hold', () => {
    expect(
      resolveEffectiveNativeFeatures({
        settingEnabled: true,
        hasPermission: true,
        hostAvailable: true,
      }),
    ).toBe(true);
  });

  test('disabled when the setting is off even if permission and host are ready', () => {
    expect(
      resolveEffectiveNativeFeatures({
        settingEnabled: false,
        hasPermission: true,
        hostAvailable: true,
      }),
    ).toBe(false);
  });

  test('disabled when the user has not granted native messaging permission', () => {
    expect(
      resolveEffectiveNativeFeatures({
        settingEnabled: true,
        hasPermission: false,
        hostAvailable: true,
      }),
    ).toBe(false);
  });

  test('disabled when the native host did not PING available', () => {
    expect(
      resolveEffectiveNativeFeatures({
        settingEnabled: true,
        hasPermission: true,
        hostAvailable: false,
      }),
    ).toBe(false);
  });
});
