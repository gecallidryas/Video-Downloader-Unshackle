import { describe, expect, it } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { createCandidateRegistry } from '../candidate-registry';
import { createInMemoryPersistence } from '@/src/background/state/state-persistence';

function candidate(id: string): MediaCandidate {
  return { id, kind: 'video', protocol: 'hls', label: id } as unknown as MediaCandidate;
}

describe('candidate-registry persistence', () => {
  it('rehydrates candidates by tab from shared storage', async () => {
    const backing: Record<string, unknown> = {};
    const persistence = createInMemoryPersistence(backing);

    const registry = createCandidateRegistry({ persistence });
    registry.set(7, [candidate('a'), candidate('b')]);
    await registry.flush();

    const fresh = createCandidateRegistry({ persistence });
    await fresh.rehydrate();

    expect(fresh.get(7).map((c) => c.id)).toEqual(['a', 'b']);
    expect(fresh.findById('b')?.tabId).toBe(7);
  });
});
