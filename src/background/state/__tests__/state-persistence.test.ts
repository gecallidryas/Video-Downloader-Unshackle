import { describe, expect, it, vi } from 'vitest';
import {
  createChromeAreaPersistence,
  createInMemoryPersistence,
  createDebouncedWriter,
} from '../state-persistence';

describe('createInMemoryPersistence', () => {
  it('round-trips values through a shared backing record', async () => {
    const backing: Record<string, unknown> = {};
    const a = createInMemoryPersistence(backing);

    await a.write('jobs', [{ id: 'job-1' }]);

    const b = createInMemoryPersistence(backing);
    expect(await b.read<unknown[]>('jobs')).toEqual([{ id: 'job-1' }]);
  });

  it('removes values', async () => {
    const backing: Record<string, unknown> = {};
    const store = createInMemoryPersistence(backing);

    await store.write('k', 1);
    await store.remove('k');

    expect(await store.read('k')).toBeUndefined();
  });
});

describe('createChromeAreaPersistence', () => {
  it('reads and writes namespaced keys via the storage area', async () => {
    const get = vi.fn().mockResolvedValue({ 'unshackle:state:jobs': [1, 2] });
    const set = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const store = createChromeAreaPersistence({ get, set, remove });

    expect(await store.read('jobs')).toEqual([1, 2]);
    await store.write('jobs', [3]);
    await store.remove('jobs');

    expect(get).toHaveBeenCalledWith('unshackle:state:jobs');
    expect(set).toHaveBeenCalledWith({ 'unshackle:state:jobs': [3] });
    expect(remove).toHaveBeenCalledWith('unshackle:state:jobs');
  });
});

describe('createDebouncedWriter', () => {
  it('coalesces rapid writes into a single flush', async () => {
    vi.useFakeTimers();
    const flush = vi.fn().mockResolvedValue(undefined);
    const writer = createDebouncedWriter(flush, 50);

    writer.schedule();
    writer.schedule();
    writer.schedule();
    expect(flush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);
    expect(flush).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('flushImmediately runs the pending flush now', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const writer = createDebouncedWriter(flush, 1000);

    writer.schedule();
    await writer.flushNow();

    expect(flush).toHaveBeenCalledTimes(1);
  });
});
