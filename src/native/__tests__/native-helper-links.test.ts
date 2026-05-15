import { describe, expect, test } from 'vitest';
import { getNativeHelperInstallTarget } from '../native-helper-links';

describe('native helper install links', () => {
  test('Windows returns a generated-bat target carrying the runtime identity', () => {
    expect(
      getNativeHelperInstallTarget({
        platform: 'Win32',
        releaseBaseUrl: 'https://github.com/acme/repo/releases/',
        extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        browser: 'edge',
      }),
    ).toEqual({
      kind: 'windows-bat',
      extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      browser: 'edge',
      version: 'latest',
      releaseBaseUrl: 'https://github.com/acme/repo/releases',
      fileName: 'unshackle-native-helper-setup.bat',
    });
  });

  test('defaults the browser to chrome when not detected', () => {
    const target = getNativeHelperInstallTarget({
      platform: 'Win32',
      releaseBaseUrl: 'https://github.com/acme/repo/releases',
      extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    expect(target).toMatchObject({ kind: 'windows-bat', browser: 'chrome' });
  });

  test('non-Windows returns docs URL', () => {
    expect(
      getNativeHelperInstallTarget({
        platform: 'Linux x86_64',
        releaseBaseUrl: 'https://github.com/acme/repo/releases',
        extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).toEqual({ kind: 'docs', href: 'native-helper.html' });
  });

  test('dev mode returns docs URL unless a release base URL is configured', () => {
    expect(getNativeHelperInstallTarget({ platform: 'Win32' })).toEqual({
      kind: 'docs',
      href: 'native-helper.html',
    });
  });
});
