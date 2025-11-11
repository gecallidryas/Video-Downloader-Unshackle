import { describe, expect, test } from 'vitest';
import {
  loadFixture,
  validatePluginOutput,
  type HostPluginContract,
} from '../host-plugin-contract';

describe('host plugin contract', () => {
  test('validates well-formed plugin output', () => {
    const output = {
      candidates: [
        {
          url: 'https://cdn.example/video.mp4',
          quality: 'high',
          container: 'mp4',
        },
      ],
      subtitles: [],
      thumbnails: [],
      failureReason: undefined,
    };

    expect(validatePluginOutput(output)).toEqual({ valid: true, errors: [] });
  });

  test('rejects output missing candidates array', () => {
    const result = validatePluginOutput({});

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('candidates must be an array');
  });

  test('loads provider fixtures for contract regression tests', async () => {
    const fixture = await loadFixture('vimeo/standard-video');

    expect(fixture.input).toMatchObject({
      tabUrl: 'https://player.vimeo.com/video/1234',
      pageTitle: 'Vimeo Config Clip',
    });
    expect(validatePluginOutput(fixture.expectedOutput).valid).toBe(true);
  });

  test('runs a contract plugin against a saved fixture', async () => {
    const fixture = await loadFixture('vimeo/standard-video');
    const plugin: HostPluginContract = {
      id: 'vimeo',
      hostPatterns: ['vimeo.com', 'player.vimeo.com'],
      extract: async () => fixture.expectedOutput,
    };

    const result = await plugin.extract(fixture.input);

    expect(validatePluginOutput(result).valid).toBe(true);
    expect(result.candidates[0]).toMatchObject({
      quality: 'high',
      container: 'mp4',
    });
  });
});
