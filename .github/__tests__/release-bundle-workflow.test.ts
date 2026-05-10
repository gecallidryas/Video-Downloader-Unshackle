import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowPath = resolve(import.meta.dirname, '../workflows/release-bundle.yml');

describe('release bundle workflow', () => {
  it('builds extension and native helper artifacts on version tags', async () => {
    const source = await readFile(workflowPath, 'utf8');

    expect(source).toContain('release-bundle');
    expect(source).toContain('v*.*.*');
    expect(source).toContain('build-extension');
    expect(source).toContain('build-native-helper');
    expect(source).toContain('windows-latest');
    expect(source).toContain('node-version: 20');
    expect(source).toContain('npm run build:chrome');
    expect(source).toContain('npm run native:build');
  });

  it('emits zips and sha256 files with versioned release names', async () => {
    const source = await readFile(workflowPath, 'utf8');

    expect(source).toContain('video-downloader-unshackle-${{ needs.version.outputs.version }}.zip');
    expect(source).toContain('native-helper-${{ needs.version.outputs.version }}.zip');
    expect(source).toContain('Get-FileHash');
    expect(source).toContain('.sha256');
    expect(source).toContain('bundle-manifest.json');
    expect(source).toContain('helperHash');
    expect(source).toContain('Register-NativeHost.ps1');
  });

  it('publishes all release assets through gh-release', async () => {
    const source = await readFile(workflowPath, 'utf8');

    expect(source).toContain('softprops/action-gh-release');
    expect(source).toContain('TODO: replace <OWNER>/<REPO>');
    expect(source).toContain('artifacts/video-downloader-unshackle-${{ needs.version.outputs.version }}.zip');
    expect(source).toContain('artifacts/video-downloader-unshackle-${{ needs.version.outputs.version }}.zip.sha256');
    expect(source).toContain('artifacts/native-helper-${{ needs.version.outputs.version }}.zip');
    expect(source).toContain('artifacts/native-helper-${{ needs.version.outputs.version }}.zip.sha256');
  });
});
