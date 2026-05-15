import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const registryHelperPath = resolve(import.meta.dirname, '../_lib/Register-NativeHost.ps1');
const nativeInstallScriptPath = resolve(
  import.meta.dirname,
  '../../native/ffmpeg-helper/scripts/install-windows.ps1',
);

describe('native messaging registration scripts', () => {
  it('uses the shared per-user native messaging registry helper', async () => {
    const helper = await readFile(registryHelperPath, 'utf8');
    const nativeInstallScript = await readFile(nativeInstallScriptPath, 'utf8');

    expect(helper).toContain('function Register-NativeHost');
    expect(helper).toContain('allowed_origins');
    expect(nativeInstallScript).toContain('Register-NativeHost');
  });

  it('selects the native messaging registry hive per browser', async () => {
    const helper = await readFile(registryHelperPath, 'utf8');

    expect(helper).toContain('Software\\Google\\Chrome\\NativeMessagingHosts\\com.unshackle.ffmpeg');
    expect(helper).toContain('Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.unshackle.ffmpeg');
    expect(helper).toContain('Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\com.unshackle.ffmpeg');
    expect(helper).toContain('Software\\Chromium\\NativeMessagingHosts\\com.unshackle.ffmpeg');
    expect(helper).toContain('HKCU:\\$RegistrySubkey');
    expect(helper).toContain("[ValidateSet('chrome', 'edge', 'brave', 'chromium')]");
  });

  it('never hardcodes a fallback extension id and forwards the browser', async () => {
    const nativeInstallScript = await readFile(nativeInstallScriptPath, 'utf8');

    expect(nativeInstallScript).not.toContain('gljdakohnaibpophgamklloippklkdol');
    expect(nativeInstallScript).toContain('[Parameter(Mandatory = $true)]');
    expect(nativeInstallScript).toContain('-Browser $Browser');
  });
});
