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
    expect(configSource).not.toContain('optional_host_permissions');
    expect(configSource).toContain("'wasm-unsafe-eval'");
  });
});
