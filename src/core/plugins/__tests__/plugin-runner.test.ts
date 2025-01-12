import { describe, expect, test } from 'vitest';
import type { DetectionEvidence } from '@/video_downloader_types_skeleton';
import type { DetectorPlugin, PluginDetectionOutput } from '../detector-plugin';
import { runDetectorPlugins } from '../plugin-runner';

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

const inputEvidence: DetectionEvidence = {
  source: 'dom',
  confidence: 0.8,
  url: 'https://cdn.example.com/input.mp4',
  createdAt: 1,
};

describe('runDetectorPlugins', () => {
  test('passes context/evidence and returns normalized evidence plus policy restrictions', async () => {
    const detector = plugin({
      detect: async (context) => {
        expect(context.url.href).toBe('https://example.com/watch');
        expect(context.host).toBe('example.com');
        expect(context.evidence).toEqual([inputEvidence]);
        expect('startDownload' in context).toBe(false);

        return [
          {
            kind: 'evidence',
            evidence: {
              source: 'player-config',
              confidence: 0.9,
              url: 'https://cdn.example.com/video.mp4',
              initiatorUrl: context.url.href,
              notes: ['protocol:direct', 'title:Fixture video'],
              createdAt: 10,
            },
          },
          {
            kind: 'restriction',
            restriction: {
              status: 'unsupported',
              code: 'access-restricted',
              message: 'Login is required by this host.',
              sourcePluginId: 'example',
            },
          },
        ];
      },
    });

    const result = await runDetectorPlugins([detector], {
      url: new URL('https://example.com/watch'),
      evidence: [inputEvidence],
      now: () => 10,
    });

    expect(result.matchedPluginIds).toEqual(['example']);
    expect(result.evidence).toEqual([
      expect.objectContaining({
        source: 'player-config',
        url: 'https://cdn.example.com/video.mp4',
        notes: expect.arrayContaining(['protocol:direct', 'title:Fixture video']),
      }),
    ]);
    expect(result.restrictions).toEqual([
      expect.objectContaining({
        code: 'access-restricted',
        message: 'Login is required by this host.',
      }),
    ]);
  });

  test('isolates detector failures so later matching plugins still run', async () => {
    const result = await runDetectorPlugins(
      [
        plugin({
          id: 'broken',
          detect: async () => {
            throw new Error('boom');
          },
        }),
        plugin({
          id: 'working',
          detect: async () => ({
            kind: 'evidence',
            evidence: {
              source: 'player-config',
              confidence: 0.7,
              url: 'https://cdn.example.com/ok.mp4',
              createdAt: 5,
              notes: ['protocol:direct'],
            },
          }),
        }),
      ],
      {
        url: new URL('https://example.com/watch'),
        now: () => 5,
      },
    );

    expect(result.evidence).toHaveLength(1);
    expect(result.errors).toEqual([
      expect.objectContaining({ pluginId: 'broken', message: 'boom' }),
    ]);
  });

  test('rejects unsafe plugin outputs instead of allowing direct job starts', async () => {
    const unsafeOutput = {
      kind: 'start-download',
      candidateId: 'candidate-1',
    } as unknown as PluginDetectionOutput;

    const result = await runDetectorPlugins(
      [
        plugin({
          detect: async () => unsafeOutput,
        }),
      ],
      {
        url: new URL('https://example.com/watch'),
      },
    );

    expect(result.evidence).toEqual([]);
    expect(result.restrictions).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        pluginId: 'example',
        message: expect.stringContaining('Unsupported plugin output'),
      }),
    ]);
  });
});
