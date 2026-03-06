const DEFAULT_DOCS_HREF = 'native-helper.html';
const SETUP_VERSION = '0.1.0';

export type NativeHelperInstallTarget =
  | { kind: 'powershell-setup'; href: string }
  | { kind: 'docs'; href: string };

export function getNativeHelperInstallTarget(input: {
  platform?: string;
  setupBaseUrl?: string;
  extensionId?: string;
}): NativeHelperInstallTarget {
  if (!isWindowsPlatform(input.platform) || !input.setupBaseUrl || !input.extensionId) {
    return { kind: 'docs', href: DEFAULT_DOCS_HREF };
  }

  const baseUrl = input.setupBaseUrl.replace(/\/+$/, '');
  const extensionId = encodeURIComponent(input.extensionId);

  return {
    kind: 'powershell-setup',
    href: `${baseUrl}/unshackle-native-helper-setup-${SETUP_VERSION}-windows.zip?extensionId=${extensionId}`,
  };
}

function isWindowsPlatform(platform?: string): boolean {
  return typeof platform === 'string' && /^win/i.test(platform);
}
