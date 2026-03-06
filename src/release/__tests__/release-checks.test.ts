import { describe, expect, test } from 'vitest';
import { validateReleaseManifest } from '../release-checks';

describe('release checks', () => {
  test('validates manifest permissions, icons, and package metadata', () => {
    expect(
      validateReleaseManifest({
        packageJson: {
          name: 'video-downloader-unshackle',
          version: '0.1.0',
          scripts: { build: 'wxt build', 'release:check': 'node scripts/release-checks.mjs' },
        },
        manifest: {
          name: 'Video Downloader - Unshackle',
          version: '0.1.0',
          icons: {
            16: 'icon-16.png',
            32: 'icon-32.png',
            48: 'icon-48.png',
            128: 'icon-128.png',
          },
          permissions: ['storage', 'downloads', 'unlimitedStorage'],
        },
        existingFiles: new Set([
          'public/icon-16.png',
          'public/icon-32.png',
          'public/icon-48.png',
          'public/icon-128.png',
        ]),
      }),
    ).toEqual([]);
  });

  test('reports missing required icon assets', () => {
    expect(
      validateReleaseManifest({
        packageJson: {
          name: 'video-downloader-unshackle',
          version: '0.1.0',
          scripts: { build: 'wxt build', 'release:check': 'node scripts/release-checks.mjs' },
        },
        manifest: {
          name: 'Video Downloader - Unshackle',
          version: '0.1.0',
          icons: { 16: 'icon-16.png' },
          permissions: ['storage'],
        },
        existingFiles: new Set(['public/icon-16.png']),
      }),
    ).toContain('Missing manifest icon size 128.');
  });
});
