import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const setupScriptPath = resolve(import.meta.dirname, '../../scripts/setup-windows.ps1');

describe('Windows native helper setup — yt-dlp', () => {
  it('installs the yt-dlp winget package alongside ffmpeg', async () => {
    const source = await readFile(setupScriptPath, 'utf8');

    expect(source).toContain("YtDlpPackageId = 'yt-dlp.yt-dlp'");
    expect(source).toContain('Invoke-WingetInstall -PackageId $YtDlpPackageId');
    expect(source).toContain("Test-CommandVersion -Command 'yt-dlp'");
  });

  it('supports refreshing yt-dlp via self-update', async () => {
    const source = await readFile(setupScriptPath, 'utf8');

    expect(source).toContain('function Update-YtDlp');
    expect(source).toContain('-U');
    expect(source).toContain('SkipYtDlpUpdate');
  });
});
