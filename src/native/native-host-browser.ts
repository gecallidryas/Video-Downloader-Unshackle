export type NativeHostBrowser = 'chrome' | 'edge' | 'brave' | 'chromium';

const NATIVE_HOST_KEY = 'com.unshackle.ffmpeg';

export const NATIVE_HOST_REGISTRY_SUBKEYS: Record<NativeHostBrowser, string> = {
  chrome: `Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_KEY}`,
  edge: `Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_KEY}`,
  brave: `Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${NATIVE_HOST_KEY}`,
  chromium: `Software\\Chromium\\NativeMessagingHosts\\${NATIVE_HOST_KEY}`,
};

export function nativeHostRegistrySubkey(browser: NativeHostBrowser): string {
  return NATIVE_HOST_REGISTRY_SUBKEYS[browser];
}

interface NavigatorLike {
  userAgent: string;
  brave?: unknown;
}

export function detectNativeHostBrowser(
  nav: NavigatorLike = typeof navigator === 'undefined'
    ? { userAgent: '' }
    : (navigator as unknown as NavigatorLike),
): NativeHostBrowser {
  if (nav.brave) {
    return 'brave';
  }

  const ua = nav.userAgent ?? '';
  if (/\bEdg\//.test(ua)) {
    return 'edge';
  }

  if (/\bChromium\//.test(ua) && !/\bChrome\//.test(ua)) {
    return 'chromium';
  }

  return 'chrome';
}
