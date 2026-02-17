import { describe, expect, test } from 'vitest';
import { getNativeHelperInstallTarget } from '../native-helper-links';

describe('native helper install links', () => {
  test('Windows returns configured PowerShell setup package URL', () => {
    expect(
      getNativeHelperInstallTarget({
        platform: 'Win32',
        setupBaseUrl: 'https://downloads.example.test/unshackle',
        extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).toEqual({
      kind: 'powershell-setup',
      href: 'https://downloads.example.test/unshackle/unshackle-native-helper-setup-0.1.0-windows.zip?extensionId=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
  });

  test('non-Windows returns docs URL', () => {
    expect(
      getNativeHelperInstallTarget({
        platform: 'Linux x86_64',
        setupBaseUrl: 'https://downloads.example.test/unshackle',
        extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).toEqual({ kind: 'docs', href: 'docs/native-helper.md' });
  });

  test('dev mode returns docs URL unless setup package URL is configured', () => {
    expect(getNativeHelperInstallTarget({ platform: 'Win32' })).toEqual({
      kind: 'docs',
      href: 'docs/native-helper.md',
    });
  });
});
