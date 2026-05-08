import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const installerPath = resolve(import.meta.dirname, '../install-windows.ps1');
const registryHelperPath = resolve(import.meta.dirname, '../_lib/Register-NativeHost.ps1');
const nativeInstallScriptPath = resolve(
  import.meta.dirname,
  '../../native/ffmpeg-helper/scripts/install-windows.ps1',
);

describe('standalone Windows native helper installer', () => {
  it('downloads and verifies the release bundle before registering the host', async () => {
    const source = await readFile(installerPath, 'utf8');

    expect(source).toContain("$Script:ReleasesBaseUrl = 'https://github.com/<OWNER>/<REPO>/releases'");
    expect(source).toContain('native-helper-$ResolvedVersion.zip');
    expect(source).toContain('native-helper-$ResolvedVersion.zip.sha256');
    expect(source).toContain('Invoke-WebRequest');
    expect(source).toContain('/download/$ResolvedVersion/');
    expect(source).toContain('Get-FileHash');
    expect(source).toContain('SHA256');
    expect(source).toContain('Expand-Archive');
  });

  it('installs the required end-user dependencies with winget', async () => {
    const source = await readFile(installerPath, 'utf8');

    expect(source).toContain("NodePackageId = 'OpenJS.NodeJS.LTS'");
    expect(source).toContain("FfmpegPackageId = 'Gyan.FFmpeg'");
    expect(source).toContain("YtDlpPackageId = 'yt-dlp.yt-dlp'");
    expect(source).toContain('Get-Command winget');
    expect(source).toContain('function Update-YtDlp');
    expect(source).toContain('-U');
    expect(source).toContain('[switch] $AssumeYes');
    expect(source).toContain('[switch] $SkipDependencyInstall');
  });

  it('uses the shared per-user native messaging registry helper', async () => {
    const installer = await readFile(installerPath, 'utf8');
    const helper = await readFile(registryHelperPath, 'utf8');
    const nativeInstallScript = await readFile(nativeInstallScriptPath, 'utf8');

    expect(helper).toContain('function Register-NativeHost');
    expect(helper).toContain('HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.unshackle.ffmpeg');
    expect(helper).toContain('allowed_origins');
    expect(installer).toContain('Register-NativeHost');
    expect(nativeInstallScript).toContain('Register-NativeHost');
  });

  it('prints a final readiness summary with detected tools and install path', async () => {
    const source = await readFile(installerPath, 'utf8');

    expect(source).toContain('Readiness summary');
    expect(source).toContain("Get-CommandVersionLine -Command 'ffmpeg'");
    expect(source).toContain("Get-CommandVersionLine -Command 'yt-dlp'");
    expect(source).toContain('Host install path');
  });
});
