import { describe, expect, test } from 'vitest';
import { createDemoMediaCandidates } from '../demo-flow';

describe('createDemoMediaCandidates', () => {
  test('returns safe direct and HLS test candidates for debug mode', () => {
    const candidates = createDemoMediaCandidates({
      tabId: 1,
      origin: 'https://example.test',
      pageUrl: 'https://example.test/demo',
      pageTitle: 'Demo',
    });

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'debug-demo-direct',
      'debug-demo-hls',
    ]);
    expect(candidates.every((candidate) => candidate.protection.kind === 'none')).toBe(true);
  });
});
