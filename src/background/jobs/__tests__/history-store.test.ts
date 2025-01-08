import { describe, expect, test } from 'vitest';
import type {
  DownloadJob,
  HistoryRecord,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import {
  createFailedHistoryRecord,
  createHistoryStore,
  historyRecordFromCompletedJob,
} from '../history-store';

function buildCandidate(
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

function buildJob(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: 'job-1',
    candidateId: 'candidate-1',
    tabId: 7,
    phase: 'completed',
    createdAt: 100,
    updatedAt: 200,
    selection: { mode: 'best' },
    progressPct: 100,
    bytesDownloaded: 123,
    output: {
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      downloadId: 5,
      sizeBytes: 123,
    },
    ...overrides,
  };
}

describe('history store', () => {
  test('stores, lists, replaces, and clears history records', () => {
    const store = createHistoryStore(() => 100);
    const first: HistoryRecord = {
      id: 'history-1',
      candidateId: 'candidate-1',
      displayName: 'First',
      mediaKind: 'video',
      protocol: 'direct',
      pageUrl: 'https://example.com/first',
      status: 'completed',
      createdAt: 100,
      updatedAt: 100,
    };
    const replacement: HistoryRecord = {
      ...first,
      displayName: 'Replacement',
      updatedAt: 200,
    };

    store.upsert(first);
    store.upsert(replacement);

    expect(store.list()).toEqual([replacement]);
    expect(store.get('history-1')).toEqual(replacement);

    store.clear();
    expect(store.list()).toEqual([]);
  });

  test('creates completed history records from direct jobs', () => {
    expect(
      historyRecordFromCompletedJob(buildCandidate(), buildJob(), () => 300),
    ).toEqual({
      id: 'history-job-1',
      candidateId: 'candidate-1',
      displayName: 'Direct video',
      mediaKind: 'video',
      protocol: 'direct',
      pageUrl: 'https://example.com/watch',
      pageTitle: 'Example page',
      status: 'completed',
      fileName: 'video.mp4',
      fileSizeBytes: 123,
      createdAt: 100,
      updatedAt: 300,
    });
  });

  test('creates failed history records with error metadata', () => {
    expect(
      createFailedHistoryRecord(
        buildCandidate(),
        buildJob({
          phase: 'failed',
          failure: {
            code: 'NETWORK_ERROR',
            message: 'Network failed',
            retryable: true,
          },
        }),
        () => 400,
      ),
    ).toEqual({
      id: 'history-job-1',
      candidateId: 'candidate-1',
      displayName: 'Direct video',
      mediaKind: 'video',
      protocol: 'direct',
      pageUrl: 'https://example.com/watch',
      pageTitle: 'Example page',
      status: 'failed',
      createdAt: 100,
      updatedAt: 400,
      errorMessage: 'Network failed',
      failureCode: 'NETWORK_ERROR',
    });
  });
});
