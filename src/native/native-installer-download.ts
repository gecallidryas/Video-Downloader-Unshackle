import { generateNativeHostInstallerBat } from './generate-installer-bat';
import { detectNativeHostBrowser } from './native-host-browser';
import {
  getNativeHelperInstallTarget,
  type NativeHelperInstallTarget,
} from './native-helper-links';

const PROJECT_RELEASES_URL =
  'https://github.com/gecallidryas/Video-Downloader-Unshackle/releases';

export function resolveNativeHelperInstallTarget(options?: {
  releaseBaseUrl?: string;
}): NativeHelperInstallTarget {
  const runtimeId = typeof chrome === 'undefined' ? undefined : chrome.runtime?.id;
  const platform = typeof navigator === 'undefined' ? undefined : navigator.platform;

  return getNativeHelperInstallTarget({
    platform,
    releaseBaseUrl: options?.releaseBaseUrl ?? PROJECT_RELEASES_URL,
    extensionId: runtimeId,
    browser: detectNativeHostBrowser(),
  });
}

/**
 * Builds the self-contained installer for the live extension id and streams it to the
 * user as a download. Returns false when the target is not a generatable Windows bat
 * (e.g. docs fallback on non-Windows), so callers can route to their docs link instead.
 */
export function downloadNativeHelperInstaller(target: NativeHelperInstallTarget): boolean {
  if (target.kind !== 'windows-bat') {
    return false;
  }

  const bat = generateNativeHostInstallerBat({
    extensionId: target.extensionId,
    browser: target.browser,
    version: target.version,
    releaseBaseUrl: target.releaseBaseUrl,
  });

  const blob = new Blob([bat], { type: 'application/bat' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = target.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}
