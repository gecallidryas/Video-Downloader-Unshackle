import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const projectRoot = process.cwd();

describe('background browser HLS export bundle boundary', () => {
  test('browser HLS runner source does not import the mux.js transmuxer module', () => {
    const source = readFileSync(
      join(projectRoot, 'src/background/jobs/browser-hls-runner.ts'),
      'utf8',
    );

    expect(source).not.toContain('muxjs-transmuxer');
    expect(source).not.toContain("from 'mux.js'");
  });

  test('built MV3 background does not import mux or Vite preload helper chunks', () => {
    const backgroundPath = join(projectRoot, '.output/chrome-mv3/background.js');

    if (!existsSync(backgroundPath)) {
      return;
    }

    const background = readFileSync(backgroundPath, 'utf8');
    const importSpecifiers = Array.from(
      background.matchAll(/from"\.\/chunks\/([^"]+)"/g),
      (match) => match[1] ?? '',
    );

    expect(importSpecifiers.some((specifier) => specifier.startsWith('mux-'))).toBe(false);
    expect(importSpecifiers.some((specifier) => specifier.startsWith('preload-helper'))).toBe(false);
    expect(background).not.toContain('mux.js Transmuxer');
  });
});
