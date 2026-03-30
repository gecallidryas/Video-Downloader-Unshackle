import { describe, expect, it, vi } from 'vitest';
import type {
  DownloadJob,
  JobOutput,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import { createJobStore } from '../job-store';
import { createDownloadQueue } from '../download-queue';
import { createInMemoryPersistence } from '@/src/background/state/state-persistence';

function candidate(id: string, tabId = 1): MediaCandidate {
  return { id, tabId, kind: 'video', protocol: 'hls', label: id } as unknown as MediaCandidate;
}

const output: JobOutput = { fileName: 'out.mp4', mimeType: 'video/mp4' };

describe('download-queue persistence', () => {
  it('resumes a job that was mid-flight when the worker died', async () => {
    const jobBacking: Record<string, unknown> = {};
    const queueBacking: Record<string, unknown> = {};
    const jobPersistence = createInMemoryPersistence(jobBacking);
    const queuePersistence = createInMemoryPersistence(queueBacking);

    const jobStore = createJobStore(() => 1000, { persistence: jobPersistence });
    const queue = createDownloadQueue({
      jobStore,
      executeJob: async () => output,
      persistence: queuePersistence,
    });

    const job = queue.enqueue(candidate('cand-1'));
    jobStore.update(job.id, { phase: 'fetching', progressPct: 30 });
    await queue.flush();
    await jobStore.flush();

    const freshJobStore = createJobStore(() => 2000, { persistence: jobPersistence });
    await freshJobStore.rehydrate();
    const executeJob = vi.fn<(job: DownloadJob, c: MediaCandidate) => Promise<JobOutput>>(
      async () => output,
    );
    const freshQueue = createDownloadQueue({
      jobStore: freshJobStore,
      executeJob,
      persistence: queuePersistence,
    });

    await freshQueue.rehydrate();

    expect(freshJobStore.get(job.id)?.phase).toBe('queued');

    await freshQueue.drain();

    expect(executeJob).toHaveBeenCalledTimes(1);
    expect(executeJob.mock.calls[0]?.[1]?.id).toBe('cand-1');
    expect(freshJobStore.get(job.id)?.phase).toBe('completed');
  });
});
