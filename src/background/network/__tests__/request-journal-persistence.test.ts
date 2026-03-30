import { describe, expect, it } from 'vitest';
import { createRequestJournal } from '../request-journal';
import { createInMemoryPersistence } from '@/src/background/state/state-persistence';

describe('request-journal persistence', () => {
  it('rehydrates journalled evidence from shared storage', async () => {
    const backing: Record<string, unknown> = {};
    const persistence = createInMemoryPersistence(backing);

    const journal = createRequestJournal(200, { persistence });
    journal.addRequest(3, {
      url: 'https://example.com/video.m3u8',
      type: 'xmlhttprequest',
    });
    await journal.flush();

    const fresh = createRequestJournal(200, { persistence });
    await fresh.rehydrate();

    const entries = fresh.get(3);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.url).toBe('https://example.com/video.m3u8');
    expect(fresh.tabIds()).toContain(3);
  });
});
