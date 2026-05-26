import { describe, expect, it } from 'vitest';
import { generateNativeHostInstallerBat } from '@/src/native/generate-installer-bat';

const VALID_ID = 'abcdefghijklmnopabcdefghijklmnop';

function build(overrides: Partial<Parameters<typeof generateNativeHostInstallerBat>[0]> = {}) {
  return generateNativeHostInstallerBat({
    extensionId: VALID_ID,
    browser: 'chrome',
    version: 'v1.2.3',
    releaseBaseUrl: 'https://github.com/acme/repo/releases',
    ...overrides,
  });
}

describe('generateNativeHostInstallerBat', () => {
  it('emits a batch file that bootstraps PowerShell with an execution-policy bypass', () => {
    const bat = build();
    expect(bat.startsWith('@echo off')).toBe(true);
    expect(bat).toContain('-ExecutionPolicy Bypass');
    expect(bat).toContain('-NoProfile');
  });

  it('contains exactly one body marker and never spells it literally in the header', () => {
    const bat = build();
    const matches = bat.match(/#PSBODY#/g) ?? [];
    expect(matches).toHaveLength(1);
    // header reconstructs the marker from char codes so IndexOf finds the real one
    expect(bat).toContain('[char]35');
  });

  it('bakes the runtime extension id into the embedded PowerShell as a literal', () => {
    const bat = build({ extensionId: VALID_ID });
    expect(bat).toContain(`$ExtensionId = '${VALID_ID}'`);
  });

  it('bakes the detected browser and its registry hive', () => {
    expect(build({ browser: 'edge' })).toContain(
      'Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.unshackle.ffmpeg',
    );
    expect(build({ browser: 'brave' })).toContain(
      'Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\com.unshackle.ffmpeg',
    );
    expect(build({ browser: 'brave' })).toContain("$Browser = 'brave'");
  });

  it('bakes the resolved release version and base url', () => {
    const bat = build({ version: 'v9.9.9', releaseBaseUrl: 'https://example.test/releases/' });
    expect(bat).toContain("$Version = 'v9.9.9'");
    // trailing slash trimmed
    expect(bat).toContain("$ReleaseBaseUrl = 'https://example.test/releases'");
  });

  it('wires allowed_origins to the baked extension id', () => {
    const bat = build();
    expect(bat).toContain(`chrome-extension://${VALID_ID}/`);
  });

  it('never embeds a hardcoded fallback extension id', () => {
    expect(build()).not.toContain('gljdakohnaibpophgamklloippklkdol');
  });

  it('rejects an extension id that is not 32 chars in the a-p alphabet', () => {
    expect(() => build({ extensionId: 'TOO-SHORT' })).toThrow();
    expect(() => build({ extensionId: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz' })).toThrow();
  });

  it('embeds the end-user dependency install via winget', () => {
    const bat = build();
    expect(bat).toContain("$NodePackageId = 'OpenJS.NodeJS.LTS'");
    expect(bat).toContain("$FfmpegPackageId = 'Gyan.FFmpeg'");
    expect(bat).toContain("$YtDlpPackageId = 'yt-dlp.yt-dlp'");
    expect(bat).toContain('Get-Command winget');
  });

  it('embeds a checksum-verified bundle download and expand', () => {
    const bat = build();
    expect(bat).toContain("'native-helper-' + $ResolvedVersion + '.zip'");
    expect(bat).toContain('Get-FileHash');
    expect(bat).toContain('-Algorithm SHA256');
    expect(bat).toContain('Expand-Archive');
    expect(bat).toContain('Invoke-WebRequest');
  });

  it('embeds a final readiness summary', () => {
    const bat = build();
    expect(bat).toContain('Readiness summary');
    expect(bat).toContain("Get-CommandVersionLine -Command 'ffmpeg'");
    expect(bat).toContain("Get-CommandVersionLine -Command 'yt-dlp'");
  });

  it('resolves the latest version via the GitHub API rather than redirect parsing', () => {
    const bat = build();
    // Derives owner/repo from the release base URL and queries the JSON API.
    expect(bat).toContain('https://api.github.com/repos/');
    expect(bat).toContain('Invoke-RestMethod');
    expect(bat).toContain('$Release.tag_name');
    expect(bat).toContain("'User-Agent'");
    // The fragile PS 5.1 redirect-parsing path must be gone.
    expect(bat).not.toContain('-MaximumRedirection 0');
  });

  it('extracts the bundle to a staging dir, never the install dir', () => {
    const bat = build();
    // The bundle script copies its own dist/ into -InstallDir; extracting into the
    // install dir would make source == destination ("overwrite item with itself").
    expect(bat).toContain("Join-Path $StageDir 'scripts\\install-windows.ps1'");
    expect(bat).not.toContain('Expand-NativeHelperBundle -ZipPath $ZipPath -Destination $InstallDir');
  });

  it('auto-resets a stale install dir so reruns need no manual cleanup', () => {
    const bat = build();
    expect(bat).toContain('function Reset-InstallDir');
    expect(bat).toContain('Reset-InstallDir -Target $InstallDir');
    expect(bat).toContain('Stop-Process');
    expect(bat).toContain('Remove-Item -LiteralPath $Target -Recurse -Force');
  });

  it('is robust on Windows PowerShell 5.1 (TLS 1.2 + basic parsing)', () => {
    const bat = build();
    expect(bat).toContain('Tls12');
    // Every web fetch must avoid the legacy IE DOM parser.
    const fetches = bat.match(/Invoke-WebRequest[^\r\n]*/g) ?? [];
    expect(fetches.length).toBeGreaterThan(0);
    for (const call of fetches) {
      expect(call).toContain('-UseBasicParsing');
    }
  });
});
