import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadNativeHelperInstaller,
  resolveNativeHelperInstallTarget,
} from '@/src/native/native-installer-download';

const VALID_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveNativeHelperInstallTarget', () => {
  it('returns a windows-bat target carrying the live runtime id on Windows', () => {
    vi.stubGlobal('chrome', { runtime: { id: VALID_ID } });
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Chrome/120' });

    expect(resolveNativeHelperInstallTarget()).toMatchObject({
      kind: 'windows-bat',
      extensionId: VALID_ID,
      browser: 'chrome',
    });
  });

  it('falls back to docs when there is no runtime id', () => {
    vi.stubGlobal('chrome', { runtime: {} });
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Chrome/120' });

    expect(resolveNativeHelperInstallTarget()).toEqual({
      kind: 'docs',
      href: 'native-helper.html',
    });
  });
});

describe('downloadNativeHelperInstaller', () => {
  it('returns false for a docs target without touching the DOM', () => {
    expect(
      downloadNativeHelperInstaller({ kind: 'docs', href: 'native-helper.html' }),
    ).toBe(false);
  });

  it('generates and downloads a bat for a windows-bat target', () => {
    const click = vi.fn();
    const anchor = { href: '', download: '', click, remove: vi.fn() } as unknown as HTMLAnchorElement;
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() },
    });

    const result = downloadNativeHelperInstaller({
      kind: 'windows-bat',
      extensionId: VALID_ID,
      browser: 'chrome',
      version: 'latest',
      releaseBaseUrl: 'https://github.com/acme/repo/releases',
      fileName: 'unshackle-native-helper-setup.bat',
    });

    expect(result).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(anchor.download).toBe('unshackle-native-helper-setup.bat');
  });
});
