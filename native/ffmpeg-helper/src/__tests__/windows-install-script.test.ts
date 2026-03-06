import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const installScriptPath = resolve(
  import.meta.dirname,
  '../../scripts/install-windows.ps1',
);
const launcherTemplatePath = resolve(
  import.meta.dirname,
  '../../launcher/windows/UnshackleFfmpegHelperLauncher.cs',
);

describe('Windows native helper installer', () => {
  it('registers a native executable launcher instead of a command script', async () => {
    const source = await readFile(installScriptPath, 'utf8');

    expect(source).toContain('unshackle-ffmpeg-helper.exe');
    expect(source).toContain('UnshackleFfmpegHelperLauncher.cs');
    expect(source).toContain('Compile-Launcher');
    expect(source).toContain('Stop-ExistingLauncher');
    expect(source).not.toContain('unshackle-ffmpeg-helper.cmd');
  });

  it('flushes forwarded stdin chunks without waiting for Chrome to close stdin', async () => {
    const source = await readFile(launcherTemplatePath, 'utf8');

    expect(source).toContain('ReadAndFlush');
    expect(source).toContain('output.Flush();');
    expect(source).not.toContain('input.CopyTo(output);');
  });
});
