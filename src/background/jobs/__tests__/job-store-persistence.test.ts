import { describe, expect, it } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { createJobStore } from '../job-store';
import { createInMemoryPersistence } from '@/src/background/state/state-persistence';

function candidate(id: string, tabId = 1): MediaCandidate {
  return {
    id,
    tabId,
    kind: 'video',
    protocol: 'hls',
    label: id,
  } as unknown as MediaCandidate;
}

describe('job-store persistence', () => {
  it('rehydrates jobs into a fresh store from shared storage', async () => {
    const backing: Record<string, unknown> = {};
    const persistence = createInMemoryPersistence(backing);

    const store = createJobStore(() => 1000, { persistence, persistKey: 'jobs' });
    const job = store.create(candidate('cand-1'));
    store.update(job.id, { phase: 'fetching', progressPct: 42 });
    await store.flush();

    const fresh = createJobStore(() => 2000, { persistence, persistKey: 'jobs' });
    await fresh.rehydrate();

    const rehydrated = fresh.get(job.id);
    expect(rehydrated?.phase).toBe('fetching');
    expect(rehydrated?.progressPct).toBe(42);
  });

  it('continues the id sequence after rehydration to avoid collisions', async () => {
    const backing: Record<string, unknown> = {};
    const persistence = createInMemoryPersistence(backing);

    const store = createJobStore(() => 1000, { persistence, persistKey: 'jobs' });
    const first = store.create(candidate('cand-1'));
    await store.flush();

    const fresh = createJobStore(() => 1000, { persistence, persistKey: 'jobs' });
    await fresh.rehydrate();
    const second = fresh.create(candidate('cand-2'));

    expect(second.id).not.toBe(first.id);
  });
});
