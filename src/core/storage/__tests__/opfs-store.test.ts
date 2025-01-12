import { describe, expect, test } from 'vitest';
import {
  createBestAvailableBinaryStore,
  createMemoryBinaryStore,
  createOpfsJobStore,
} from '../opfs-store';

describe('OPFS store', () => {
  test('streams writes and reads through the available binary store', async () => {
    const binaryStore = createMemoryBinaryStore();
    const jobStore = createOpfsJobStore(binaryStore);

    await jobStore.writeStream('job-1', 'video.bin', [
      new Uint8Array([1, 2]),
      new Uint8Array([3]),
    ]);

    await expect(jobStore.readFile('job-1', 'video.bin')).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await expect(jobStore.listFiles('job-1')).resolves.toEqual(['video.bin']);

    await jobStore.deleteJobDirectory('job-1');
    await expect(jobStore.listFiles('job-1')).resolves.toEqual([]);
  });

  test('falls back to memory storage when OPFS is unavailable', async () => {
    const store = await createBestAvailableBinaryStore({
      storage: undefined,
    });

    await store.put('fallback/file.bin', new Uint8Array([9]));
    await expect(store.exists('fallback/file.bin')).resolves.toBe(true);
  });
});
