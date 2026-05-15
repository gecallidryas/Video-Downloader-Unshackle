import { describe, expect, test, vi } from 'vitest';
import {
  createCredentialReplayManager,
  type DnrSessionApi,
  type DnrSessionRule,
} from '../credential-replay';

function fakeDnr(): DnrSessionApi & { added: DnrSessionRule[]; removed: number[] } {
  const added: DnrSessionRule[] = [];
  const removed: number[] = [];
  return {
    added,
    removed,
    updateSessionRules: vi.fn(async ({ addRules, removeRuleIds }) => {
      if (addRules) added.push(...addRules);
      if (removeRuleIds) removed.push(...removeRuleIds);
    }),
  };
}

describe('createCredentialReplayManager', () => {
  test('registers a modifyHeaders rule for captured credentials', async () => {
    const dnr = fakeDnr();
    const manager = createCredentialReplayManager(dnr);

    const id = await manager.register('https://cdn.example.com/v.mp4?token=1', {
      cookie: 'sid=abc',
      authorization: 'Bearer xyz',
    });

    expect(id).toBeDefined();
    expect(dnr.added).toHaveLength(1);
    const rule = dnr.added[0];
    expect(rule.action.type).toBe('modifyHeaders');
    expect(rule.action.requestHeaders).toEqual([
      { header: 'cookie', operation: 'set', value: 'sid=abc' },
      { header: 'authorization', operation: 'set', value: 'Bearer xyz' },
    ]);
    expect(rule.condition.urlFilter).toBe('https://cdn.example.com/v.mp4?token=1');
  });

  test('returns undefined and registers nothing when no credentials present', async () => {
    const dnr = fakeDnr();
    const manager = createCredentialReplayManager(dnr);

    const id = await manager.register('https://cdn.example.com/v.mp4', {});
    expect(id).toBeUndefined();
    expect(dnr.added).toHaveLength(0);
  });

  test('release removes the specific rule once', async () => {
    const dnr = fakeDnr();
    const manager = createCredentialReplayManager(dnr);
    const id = await manager.register('https://x/v.mp4', { cookie: 'a=1' });

    await manager.release(id);
    expect(dnr.removed).toEqual([id]);

    // releasing again is a no-op
    await manager.release(id);
    expect(dnr.removed).toEqual([id]);
  });

  test('clearAll removes every active rule', async () => {
    const dnr = fakeDnr();
    const manager = createCredentialReplayManager(dnr);
    const id1 = await manager.register('https://x/a.mp4', { cookie: 'a=1' });
    const id2 = await manager.register('https://x/b.mp4', { authorization: 'Bearer z' });

    await manager.clearAll();
    expect(dnr.removed.sort()).toEqual([id1, id2].sort());
  });

  test('strips wildcard characters from the url filter', async () => {
    const dnr = fakeDnr();
    const manager = createCredentialReplayManager(dnr);
    await manager.register('https://x/v*.mp4|^', { cookie: 'a=1' });
    expect(dnr.added[0].condition.urlFilter).toBe('https://x/v.mp4');
  });

  test('no-ops gracefully when DNR is unavailable', async () => {
    const manager = createCredentialReplayManager(undefined);
    expect(await manager.register('https://x/v.mp4', { cookie: 'a=1' })).toBeUndefined();
    await expect(manager.clearAll()).resolves.toBeUndefined();
  });
});
