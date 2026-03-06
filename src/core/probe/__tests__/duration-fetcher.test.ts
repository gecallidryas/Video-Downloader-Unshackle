import { describe, expect, test, vi } from 'vitest';
import { fetchDurationsWithLimit } from '../duration-fetcher';

describe('fetchDurationsWithLimit', () => {
  test('never runs more duration probes than the configured concurrency limit', async () => {
    let running = 0;
    let maxRunning = 0;
    const release: Array<() => void> = [];
    const probe = vi.fn(async (url: string) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise<void>((resolve) => release.push(resolve));
      running -= 1;
      return url.length;
    });

    const promise = fetchDurationsWithLimit(
      ['a.m3u8', 'bb.m3u8', 'ccc.m3u8', 'dddd.m3u8', 'eeeee.m3u8'],
      probe,
      4,
    );

    await Promise.resolve();
    expect(probe).toHaveBeenCalledTimes(4);
    expect(maxRunning).toBe(4);

    release.splice(0).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
    release.splice(0).forEach((resolve) => resolve());
    const durations = await promise;

    expect(durations).toEqual([6, 7, 8, 9, 10]);
  });
});
