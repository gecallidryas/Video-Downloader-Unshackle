import { describe, expect, test, vi } from 'vitest';
import type { DownloadJob } from '@/video_downloader_types_skeleton';
import { createJobStore } from '../job-store';
import { cleanupJobStorage } from '../cleanup-job-storage';
import { createDownloadController } from '../download-controller';
import { createDownloadQueue } from '../download-queue';

function job(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: 'job-1',
    candidateId: 'candidate-1',
    tabId: 7,
    phase: 'queued',
    createdAt: 1,
    updatedAt: 1,
    selection: { mode: 'best' },
    progressPct: 0,
    bytesDownloaded: 0,
    ...overrides,
  };
}

describe('download abort and cleanup paths', () => {
  test('cancels active direct chrome downloads and marks jobs cancelled', async () => {
    const cancelDownload = vi.fn().mockResolvedValue(undefined);
    const jobStore = createJobStore(() => 400);
    const active = jobStore.create(
      {
        id: 'candidate-1',
        tabId: 7,
        mediaKind: 'video',
        protocol: 'direct',
        status: 'ready',
        pageUrl: 'https://example.com',
        origin: 'https://example.com',
        displayName: 'Video',
        sourceUrl: 'https://cdn.example.com/video.mp4',
        protection: { kind: 'none' },
        variants: [],
        audioTracks: [],
        subtitleTracks: [],
        evidence: [],
        preview: { playable: true, adapter: 'native' },
        createdAt: 1,
        updatedAt: 1,
      },
      { mode: 'best' },
    );
    jobStore.update(active.id, {
      phase: 'fetching',
      output: { fileName: 'video.mp4', mimeType: 'video/mp4', downloadId: 55 },
    });
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls: vi.fn(),
      runDash: vi.fn(),
      cancelDownload,
    });

    await expect(controller.abort(active.id, { jobStore })).resolves.toEqual({
      cancelled: true,
      downloadId: 55,
    });
    expect(cancelDownload).toHaveBeenCalledWith(55);
    expect(jobStore.get(active.id)).toMatchObject({ phase: 'cancelled' });
  });

  test('removes queued jobs, clears completed jobs, and cleans storage buckets without masking results', async () => {
    const jobStore = createJobStore(() => 500);
    const queue = createDownloadQueue({
      jobStore,
      executeJob: vi.fn(),
    });
    const queued = jobStore.update(
      jobStore.create(
        {
          id: 'candidate-1',
          tabId: 7,
          mediaKind: 'video',
          protocol: 'direct',
          status: 'ready',
          pageUrl: 'https://example.com',
          origin: 'https://example.com',
          displayName: 'Video',
          sourceUrl: 'https://cdn.example.com/video.mp4',
          protection: { kind: 'none' },
          variants: [],
          audioTracks: [],
          subtitleTracks: [],
          evidence: [],
          preview: { playable: true, adapter: 'native' },
          createdAt: 1,
          updatedAt: 1,
        },
        { mode: 'best' },
      ).id,
      { phase: 'queued' },
    );
    const completed = jobStore.update(
      jobStore.create(
        {
          id: 'candidate-2',
          tabId: 7,
          mediaKind: 'video',
          protocol: 'direct',
          status: 'ready',
          pageUrl: 'https://example.com',
          origin: 'https://example.com',
          displayName: 'Video 2',
          sourceUrl: 'https://cdn.example.com/video2.mp4',
          protection: { kind: 'none' },
          variants: [],
          audioTracks: [],
          subtitleTracks: [],
          evidence: [],
          preview: { playable: true, adapter: 'native' },
          createdAt: 1,
          updatedAt: 1,
        },
        { mode: 'best' },
      ).id,
      { phase: 'completed' },
    );

    expect(queue.removeQueued(queued.id)).toBe(true);
    expect(jobStore.get(queued.id)).toMatchObject({ phase: 'cancelled' });
    expect(queue.clearCompleted()).toEqual([completed.id]);
    expect(jobStore.get(completed.id)).toBeUndefined();

    const storage = {
      deleteBucket: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('opfs cleanup failed')),
    };
    await expect(cleanupJobStorage('job-9', { indexedDb: storage, opfs: storage })).resolves.toEqual({
      ok: false,
      errors: ['opfs cleanup failed'],
    });
    expect(storage.deleteBucket).toHaveBeenCalledWith('job-9');
    expect(storage.deleteBucket).toHaveBeenCalledWith('job-9_audio');
    expect(storage.deleteBucket).toHaveBeenCalledWith('job-9_subs');
  });
});
