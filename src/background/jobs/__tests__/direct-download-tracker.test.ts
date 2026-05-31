import { describe, expect, test, vi } from 'vitest';
import type { DownloadJob } from '@/video_downloader_types_skeleton';
import { createJobStore } from '../job-store';
import { createDirectDownloadTracker } from '../direct-download-tracker';

function directCandidate(id: string) {
  return {
    id,
    tabId: 7,
    mediaKind: 'video' as const,
    protocol: 'direct' as const,
    status: 'ready' as const,
    pageUrl: 'https://example.com',
    origin: 'https://example.com',
    displayName: 'Video',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    protection: { kind: 'none' as const },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' as const },
    createdAt: 1,
    updatedAt: 1,
  };
}

function completedDirectJob(jobStore: ReturnType<typeof createJobStore>, candidateId: string): DownloadJob {
  const job = jobStore.create(directCandidate(candidateId), { mode: 'best' });
  return jobStore.update(job.id, {
    phase: 'completed',
    progressPct: 100,
    output: { fileName: 'video.mp4', mimeType: 'video/mp4', downloadId: 55 },
  });
}

describe('createDirectDownloadTracker', () => {
  test('marks the tracked job failed when the download is interrupted', () => {
    const jobStore = createJobStore(() => 100);
    const job = completedDirectJob(jobStore, 'candidate-1');
    const tracker = createDirectDownloadTracker({ jobStore });

    tracker.track(55, job.id);
    tracker.handleChange({
      id: 55,
      state: { previous: 'in_progress', current: 'interrupted' },
      error: { previous: undefined, current: 'SERVER_FORBIDDEN' },
    });

    const updated = jobStore.get(job.id);
    expect(updated?.phase).toBe('failed');
    expect(updated?.failure?.code).toBe('NETWORK_ERROR');
    expect(updated?.failure?.message).toMatch(/SERVER_FORBIDDEN/);
  });

  test('leaves a completed download untouched', () => {
    const jobStore = createJobStore(() => 100);
    const job = completedDirectJob(jobStore, 'candidate-1');
    const tracker = createDirectDownloadTracker({ jobStore });

    tracker.track(55, job.id);
    tracker.handleChange({
      id: 55,
      state: { previous: 'in_progress', current: 'complete' },
    });

    const updated = jobStore.get(job.id);
    expect(updated?.phase).toBe('completed');
    expect(updated?.failure).toBeUndefined();
  });

  test('ignores changes for downloads it does not track', () => {
    const jobStore = createJobStore(() => 100);
    const job = completedDirectJob(jobStore, 'candidate-1');
    const tracker = createDirectDownloadTracker({ jobStore });

    tracker.handleChange({
      id: 999,
      state: { previous: 'in_progress', current: 'interrupted' },
      error: { previous: undefined, current: 'NETWORK_FAILED' },
    });

    expect(jobStore.get(job.id)?.phase).toBe('completed');
  });

  test('untracks after a terminal state so later deltas are ignored', () => {
    const jobStore = createJobStore(() => 100);
    const job = completedDirectJob(jobStore, 'candidate-1');
    const tracker = createDirectDownloadTracker({ jobStore });

    tracker.track(55, job.id);
    tracker.handleChange({
      id: 55,
      state: { previous: 'in_progress', current: 'complete' },
    });

    // A late, spurious interrupted delta for the same id must not flip the job.
    tracker.handleChange({
      id: 55,
      state: { previous: 'complete', current: 'interrupted' },
      error: { previous: undefined, current: 'NETWORK_FAILED' },
    });

    expect(jobStore.get(job.id)?.phase).toBe('completed');
  });

  test('does not throw if the tracked job was already removed', () => {
    const jobStore = createJobStore(() => 100);
    const job = completedDirectJob(jobStore, 'candidate-1');
    const tracker = createDirectDownloadTracker({ jobStore });

    tracker.track(55, job.id);
    jobStore.delete(job.id);

    expect(() =>
      tracker.handleChange({
        id: 55,
        state: { previous: 'in_progress', current: 'interrupted' },
        error: { previous: undefined, current: 'NETWORK_FAILED' },
      }),
    ).not.toThrow();
  });

  test('does not flip a job the user cancelled', () => {
    const jobStore = createJobStore(() => 100);
    const job = completedDirectJob(jobStore, 'candidate-1');
    jobStore.update(job.id, {
      phase: 'cancelled',
      failure: { code: 'USER_CANCELLED', message: 'Cancelled by user', retryable: false },
    });
    const tracker = createDirectDownloadTracker({ jobStore });

    tracker.track(55, job.id);
    tracker.handleChange({
      id: 55,
      state: { previous: 'in_progress', current: 'interrupted' },
      error: { previous: undefined, current: 'USER_CANCELED' },
    });

    expect(jobStore.get(job.id)?.phase).toBe('cancelled');
  });

  test('untrack removes a download from tracking', () => {
    const jobStore = createJobStore(() => 100);
    const job = completedDirectJob(jobStore, 'candidate-1');
    const tracker = createDirectDownloadTracker({ jobStore });

    tracker.track(55, job.id);
    tracker.untrack(55);
    tracker.handleChange({
      id: 55,
      state: { previous: 'in_progress', current: 'interrupted' },
      error: { previous: undefined, current: 'NETWORK_FAILED' },
    });

    expect(jobStore.get(job.id)?.phase).toBe('completed');
  });
});
