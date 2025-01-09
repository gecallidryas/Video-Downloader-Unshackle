import { describe, expect, test } from 'vitest';
import type { DetectorPlugin, PluginDetectionOutput } from '@/src/core/plugins/detector-plugin';
import { runDetectorPlugins } from '@/src/core/plugins/plugin-runner';
import {
  createPolicyOnlyHostPlugins,
  createProductionHostPlugins,
} from '../host-plugin-registry';

function plugin(output: unknown): DetectorPlugin {
  return {
    id: 'unsafe-host',
    name: 'Unsafe Host',
    domains: ['unsafe.example'],
    capabilities: ['player-config'],
    detect: async () => output as PluginDetectionOutput,
  };
}

describe('host plugin safety boundary', () => {
  test('rejects executable-code outputs even when wrapped in a valid evidence shape', async () => {
    const result = await runDetectorPlugins(
      [
        plugin({
          kind: 'evidence',
          execute: 'eval(document.cookie)',
          evidence: {
            source: 'player-config',
            confidence: 0.8,
            url: 'https://unsafe.example/video.mp4',
            notes: ['protocol:direct'],
            createdAt: 1,
          },
        }),
      ],
      { url: new URL('https://unsafe.example/embed') },
    );

    expect(result.evidence).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        pluginId: 'unsafe-host',
        message: expect.stringContaining('Unsafe plugin output'),
      }),
    ]);
  });

  test('rejects credential extraction requests carried in output notes', async () => {
    const result = await runDetectorPlugins(
      [
        plugin({
          kind: 'evidence',
          evidence: {
            source: 'player-config',
            confidence: 0.8,
            url: 'https://unsafe.example/video.mp4',
            notes: [
              'protocol:direct',
              'credential-request:cookie',
              'authorization:Bearer token',
            ],
            createdAt: 1,
          },
        }),
      ],
      { url: new URL('https://unsafe.example/embed') },
    );

    expect(result.evidence).toEqual([]);
    expect(result.errors[0]?.message).toContain('Unsafe plugin output');
  });

  test('rejects direct download commands from host plugins', async () => {
    const result = await runDetectorPlugins(
      [plugin({ kind: 'start-download', url: 'https://unsafe.example/video.mp4' })],
      { url: new URL('https://unsafe.example/embed') },
    );

    expect(result.evidence).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      pluginId: 'unsafe-host',
      message: expect.stringContaining('Unsupported plugin output'),
    });
  });

  test('production policy-only host plugins return no media URLs', async () => {
    for (const hostPlugin of createPolicyOnlyHostPlugins()) {
      const result = await runDetectorPlugins([hostPlugin], {
        url: new URL(`https://${hostPlugin.domains[0]}/embed-fixture`),
        document: document.implementation.createHTMLDocument('policy-only'),
        now: () => 3,
      });

      expect(result.evidence, hostPlugin.id).toEqual([]);
      expect(result.restrictions[0], hostPlugin.id).toMatchObject({
        sourcePluginId: hostPlugin.id,
        status: 'unsupported',
      });
    }
  });

  test('production host registry excludes untriaged source hosts from extractor registration', () => {
    const productionIds = createProductionHostPlugins().map((item) => item.id);

    expect(productionIds).not.toContain('userload');
    expect(productionIds).not.toContain('vidlox');
  });
});
