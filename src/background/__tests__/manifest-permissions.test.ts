import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const configSource = readFileSync(resolve('wxt.config.ts'), 'utf8');

describe('WXT manifest permissions', () => {
  test('declares the capability gates needed by the detection and media pipeline', () => {
    expect(configSource).toContain("'activeTab'");
    expect(configSource).toContain("'declarativeContent'");
    expect(configSource).toContain("'alarms'");
    expect(configSource).toContain("host_permissions: ['<all_urls>']");
    expect(configSource).toContain("optional_permissions: ['nativeMessaging']");
    expect(configSource).not.toContain('optional_host_permissions');
    expect(configSource).not.toContain("'wasm-unsafe-eval'");
  });

  test('keeps native messaging optional for the mainstream build', () => {
    const permissionsBlock = configSource.match(/permissions:\s*\[([\s\S]*?)\],/)?.[1] ?? '';

    expect(configSource).toContain("optional_permissions: ['nativeMessaging']");
    expect(permissionsBlock).not.toContain("'nativeMessaging'");
  });

  test('links native helper setup without requiring WASM media execution', () => {
    const readme = readFileSync(resolve('README.md'), 'utf8');
    const nativeDocs = readFileSync(resolve('docs/native-helper.md'), 'utf8');

    expect(readme).toContain('docs/native-helper.md');
    expect(nativeDocs).toContain('FFMPEG_NOT_FOUND');
    expect(nativeDocs).toContain('NATIVE_UNAVAILABLE');
  });
});
