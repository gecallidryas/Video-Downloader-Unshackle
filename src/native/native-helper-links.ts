import { type NativeHostBrowser } from './native-host-browser';

const DEFAULT_DOCS_HREF = 'native-helper.html';
const DEFAULT_BAT_FILE_NAME = 'unshackle-native-helper-setup.bat';
const DEFAULT_VERSION = 'latest';

export type NativeHelperInstallTarget =
  | {
      kind: 'windows-bat';
      extensionId: string;
      browser: NativeHostBrowser;
      version: string;
      releaseBaseUrl: string;
      fileName: string;
    }
  | { kind: 'docs'; href: string };

export function getNativeHelperInstallTarget(input: {
  platform?: string;
  releaseBaseUrl?: string;
  extensionId?: string;
  browser?: NativeHostBrowser;
  version?: string;
}): NativeHelperInstallTarget {
  if (!isWindowsPlatform(input.platform) || !input.releaseBaseUrl || !input.extensionId) {
    return { kind: 'docs', href: DEFAULT_DOCS_HREF };
  }

  return {
    kind: 'windows-bat',
    extensionId: input.extensionId,
    browser: input.browser ?? 'chrome',
    version: input.version ?? DEFAULT_VERSION,
    releaseBaseUrl: input.releaseBaseUrl.replace(/\/+$/, ''),
    fileName: DEFAULT_BAT_FILE_NAME,
  };
}

function isWindowsPlatform(platform?: string): boolean {
  return typeof platform === 'string' && /^win/i.test(platform);
}
