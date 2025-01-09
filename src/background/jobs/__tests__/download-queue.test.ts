import { describe, expect, test, vi } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { createJobStore } from '../job-store';
import { createDownloadQueue } from '../download-queue';

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: 'Direct video',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('download queue lifecycle', () => {
  test('runs queued jobs through completion and exposes queue stats', async () => {
    const jobStore = createJobStore(() => 100);
    const queue = createDownloadQueue({
      jobStore,
      maxConcurrent: 1,
      executeJob: async () => ({
        fileName: 'video.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 10,
      }),
    });

    const job = queue.enqueue(candidate(), { mode: 'best' });
    expect(job.phase).toBe('queued');
    expect(queue.stats()).toEqual({ queued: 1, running: 0, failed: 0, completed: 0 });

    await queue.drain();

    expect(jobStore.get(job.id)).toMatchObject({
      phase: 'completed',
      progressPct: 100,
      output: { fileName: 'video.mp4' },
    });
    expect(queue.stats()).toEqual({ queued: 0, running: 0, failed: 0, completed: 1 });
  });

  test('marks failures retryable, supports explicit retry, cancel, pause and resume placeholders', async () => {
    const jobStore = createJobStore(() => 200);
    const executeJob = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        fileName: 'retry.mp4',
        mimeType: 'video/mp4',
      });
    const queue = createDownloadQueue({ jobStore, executeJob });
    const failedJob = queue.enqueue(candidate(), { mode: 'best' });

    await queue.drain();
    expect(jobStore.get(failedJob.id)).toMatchObject({
      phase: 'failed',
      failure: { code: 'NETWORK_ERROR', retryable: true },
    });

    queue.retry(failedJob.id);
    expect(jobStore.get(failedJob.id)).toMatchObject({ phase: 'queued', failure: undefined });

    await queue.drain();
    expect(jobStore.get(failedJob.id)).toMatchObject({ phase: 'completed' });

    const cancelled = queue.enqueue(candidate({ id: 'candidate-2' }), { mode: 'best' });
    expect(queue.cancel(cancelled.id)).toBe(true);
    expect(jobStore.get(cancelled.id)).toMatchObject({ phase: 'cancelled' });

    const paused = queue.enqueue(candidate({ id: 'candidate-3' }), { mode: 'best' });
    expect(queue.pause(paused.id)).toBe(true);
    expect(jobStore.get(paused.id)).toMatchObject({ phase: 'queued' });
    expect(queue.resume(paused.id)).toBe(true);
  });
});
