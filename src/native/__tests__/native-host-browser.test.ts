import { describe, expect, it } from 'vitest';
import {
  NATIVE_HOST_REGISTRY_SUBKEYS,
  detectNativeHostBrowser,
  nativeHostRegistrySubkey,
} from '@/src/native/native-host-browser';

describe('detectNativeHostBrowser', () => {
  it('detects Brave from navigator.brave', () => {
    expect(
      detectNativeHostBrowser({ userAgent: 'Mozilla/5.0 Chrome/120 Safari', brave: {} }),
    ).toBe('brave');
  });

  it('detects Edge from the Edg/ token', () => {
    expect(
      detectNativeHostBrowser({ userAgent: 'Mozilla/5.0 Chrome/120 Edg/120.0 Safari' }),
    ).toBe('edge');
  });

  it('detects plain Chromium when the Chrome vendor token is absent', () => {
    expect(
      detectNativeHostBrowser({ userAgent: 'Mozilla/5.0 Chromium/120 Safari' }),
    ).toBe('chromium');
  });

  it('falls back to chrome for vanilla Chrome user agents', () => {
    expect(
      detectNativeHostBrowser({ userAgent: 'Mozilla/5.0 Chrome/120 Safari' }),
    ).toBe('chrome');
  });
});

describe('nativeHostRegistrySubkey', () => {
  it('maps every supported browser to a per-user NativeMessagingHosts subkey', () => {
    expect(nativeHostRegistrySubkey('chrome')).toBe(
      'Software\\Google\\Chrome\\NativeMessagingHosts\\com.unshackle.ffmpeg',
    );
    expect(nativeHostRegistrySubkey('edge')).toBe(
      'Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.unshackle.ffmpeg',
    );
    expect(nativeHostRegistrySubkey('brave')).toBe(
      'Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\com.unshackle.ffmpeg',
    );
    expect(nativeHostRegistrySubkey('chromium')).toBe(
      'Software\\Chromium\\NativeMessagingHosts\\com.unshackle.ffmpeg',
    );
  });

  it('exposes the full hive map for installer scripts to reconcile against', () => {
    expect(Object.keys(NATIVE_HOST_REGISTRY_SUBKEYS).sort()).toEqual([
      'brave',
      'chrome',
      'chromium',
      'edge',
    ]);
  });
});
