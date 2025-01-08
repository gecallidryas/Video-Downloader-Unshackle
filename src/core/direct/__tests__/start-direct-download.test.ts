import { describe, expect, test } from 'vitest';
import type { JobOutput, MediaCandidate } from '@/video_downloader_types_skeleton';
import { createHistoryStore } from '@/src/background/jobs/history-store';
import { createJobStore } from '@/src/background/jobs/job-store';
import { startDirectDownload } from '../start-direct-download';

function buildDirectCandidate(
  overrides: Partial<MediaCandidate> = {},
): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    pageTitle: 'Example page',
    origin: 'https://example.com',
    displayName: 'Direct video',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    mimeType: 'video/mp4',
    fileExtensionHint: 'mp4',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe('startDirectDownload', () => {
  test('creates a queued job for a direct candidate before export completes', async () => {
    const jobStore = createJobStore(() => 1_000);
    const historyStore = createHistoryStore(() => 1_000);
    const exportDeferred = deferred<JobOutput>();
    const downloadPromise = startDirectDownload(buildDirectCandidate(), {
      jobStore,
      historyStore,
      downloadFile: () => exportDeferred.promise,
      now: () => 1_000,
    });

    expect(jobStore.list()).toEqual([
      expect.objectContaining({
        candidateId: 'candidate-1',
        tabId: 7,
        phase: 'queued',
        progressPct: 0,
      }),
    ]);

    exportDeferred.resolve({
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      downloadId: 42,
      sizeBytes: 123,
    });
    await expect(downloadPromise).resolves.toMatchObject({
      phase: 'completed',
      output: { downloadId: 42 },
    });
  });

  test('writes completed direct jobs to history', async () => {
    const jobStore = createJobStore(() => 2_000);
    const historyStore = createHistoryStore(() => 2_000);

    const job = await startDirectDownload(buildDirectCandidate(), {
      jobStore,
      historyStore,
      downloadFile: async () => ({
        fileName: 'direct-video.mp4',
        mimeType: 'video/mp4',
        downloadId: 9,
        sizeBytes: 24_000_000,
      }),
      now: () => 2_000,
    });

    expect(job).toMatchObject({
      phase: 'completed',
      progressPct: 100,
      output: {
        fileName: 'direct-video.mp4',
        downloadId: 9,
      },
    });
    expect(historyStore.list()).toEqual([
      expect.objectContaining({
        candidateId: 'candidate-1',
        displayName: 'Direct video',
        status: 'completed',
        fileName: 'direct-video.mp4',
        fileSizeBytes: 24_000_000,
      }),
    ]);
  });

  test('writes failed direct jobs with error metadata to history', async () => {
    const jobStore = createJobStore(() => 3_000);
    const historyStore = createHistoryStore(() => 3_000);

    await expect(
      startDirectDownload(buildDirectCandidate(), {
        jobStore,
        historyStore,
        downloadFile: async () => {
          throw new Error('Network failed');
        },
        now: () => 3_000,
      }),
    ).rejects.toThrow('Network failed');

    expect(jobStore.list()[0]).toMatchObject({
      phase: 'failed',
      failure: {
        code: 'NETWORK_ERROR',
        message: 'Network failed',
        retryable: true,
      },
    });
    expect(historyStore.list()).toEqual([
      expect.objectContaining({
        candidateId: 'candidate-1',
        status: 'failed',
        errorMessage: 'Network failed',
        failureCode: 'NETWORK_ERROR',
      }),
    ]);
  });

  test('rejects non-direct candidates without starting a job', async () => {
    const jobStore = createJobStore(() => 4_000);
    const historyStore = createHistoryStore(() => 4_000);

    await expect(
      startDirectDownload(
        buildDirectCandidate({
          protocol: 'hls',
          status: 'partial',
          sourceUrl: undefined,
          manifestUrl: 'https://cdn.example.com/master.m3u8',
        }),
        {
          jobStore,
          historyStore,
          downloadFile: async () => ({
            fileName: 'unused.mp4',
            mimeType: 'video/mp4',
          }),
          now: () => 4_000,
        },
      ),
    ).rejects.toThrow('Only ready direct media candidates can start direct downloads.');

    expect(jobStore.list()).toEqual([]);
    expect(historyStore.list()).toEqual([]);
  });
});
