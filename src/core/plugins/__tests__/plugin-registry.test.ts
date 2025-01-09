import { describe, expect, test } from 'vitest';
import type { DetectorPlugin } from '../detector-plugin';
import { createPluginRegistry } from '../plugin-registry';

function plugin(overrides: Partial<DetectorPlugin>): DetectorPlugin {
  return {
    id: 'example',
    name: 'Example',
    domains: ['example.com'],
    capabilities: ['dom-scan'],
    detect: async () => [],
    ...overrides,
  };
}

describe('createPluginRegistry', () => {
  test('keeps plugin domain and capability declarations queryable', () => {
    const registry = createPluginRegistry([
      plugin({
        id: 'vimeo',
        name: 'Vimeo',
        domains: ['vimeo.com', 'player.vimeo.com'],
        capabilities: ['player-config', 'policy-warning'],
      }),
    ]);

    expect(registry.get('vimeo')).toMatchObject({
      id: 'vimeo',
      domains: ['vimeo.com', 'player.vimeo.com'],
      capabilities: ['player-config', 'policy-warning'],
    });
    expect(registry.all().map((item) => item.id)).toEqual(['vimeo']);
  });

  test('matches exact, www-normalized, and subdomain hosts like source host plugins', () => {
    const registry = createPluginRegistry([
      plugin({
        id: 'sendvid',
        name: 'Sendvid',
        domains: ['sendvid.com'],
      }),
    ]);

    expect(
      registry.match({ url: new URL('https://sendvid.com/embed/abc') }).map((item) => item.id),
    ).toEqual(['sendvid']);
    expect(
      registry.match({ url: new URL('https://www.sendvid.com/embed/abc') }).map((item) => item.id),
    ).toEqual(['sendvid']);
    expect(
      registry.match({ url: new URL('https://cdn.sendvid.com/embed/abc') }).map((item) => item.id),
    ).toEqual(['sendvid']);
  });

  test('honors detector-specific match predicates after domain matching', () => {
    const registry = createPluginRegistry([
      plugin({
        id: 'canva',
        name: 'Canva',
        domains: ['canva.com'],
        matches: ({ url }) => /\/.*\/watch/.test(url.pathname),
      }),
    ]);

    expect(
      registry.match({ url: new URL('https://www.canva.com/design/watch') }).map((item) => item.id),
    ).toEqual(['canva']);
    expect(
      registry.match({ url: new URL('https://www.canva.com/design/edit') }).map((item) => item.id),
    ).toEqual([]);
  });
});
