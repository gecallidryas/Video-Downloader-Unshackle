import { describe, expect, test } from 'vitest';
import type {
  ActiveTabSnapshot,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import {
  createRuntimeRequest,
  createRuntimeResponse,
} from '@/src/shared/contracts/messages';
import { createCandidateRegistry } from '../candidates/candidate-registry';
import { createRuntimeRouter } from '../messaging/runtime-router';
import { createTabSnapshotStore } from '../state/tab-snapshots';

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
    pageTitle: 'Example',
    origin: 'https://example.com',
    displayName: 'Example download',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    mimeType: 'video/mp4',
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

function buildActiveTabSnapshot(
  overrides: Partial<ActiveTabSnapshot> = {},
): ActiveTabSnapshot {
  return {
    tabId: 7,
    url: 'https://example.com/watch',
    title: 'Example',
    favIconUrl: 'https://example.com/favicon.ico',
    ...overrides,
  };
}

describe('candidate registry', () => {
  test('stores and retrieves candidates by tabId', () => {
    const registry = createCandidateRegistry();
    const tabSevenCandidate = buildCandidate({ id: 'tab-7', tabId: 7 });
    const tabEightCandidate = buildCandidate({ id: 'tab-8', tabId: 8 });

    registry.set(7, [tabSevenCandidate]);
    registry.set(8, [tabEightCandidate]);

    expect(registry.get(7)).toEqual([tabSevenCandidate]);
    expect(registry.get(8)).toEqual([tabEightCandidate]);
    expect(registry.get(99)).toEqual([]);
  });

  test('deduplicates candidates by candidate id', () => {
    const registry = createCandidateRegistry();

    registry.set(7, [
      buildCandidate({ id: 'candidate-1', displayName: 'First copy' }),
      buildCandidate({
        id: 'candidate-1',
        displayName: 'Latest copy',
        updatedAt: 2,
      }),
      buildCandidate({ id: 'candidate-2', displayName: 'Distinct candidate' }),
    ]);

    expect(registry.get(7)).toEqual([
      buildCandidate({
        id: 'candidate-1',
        displayName: 'Latest copy',
        updatedAt: 2,
      }),
      buildCandidate({ id: 'candidate-2', displayName: 'Distinct candidate' }),
    ]);
  });
});

describe('runtime router', () => {
  test('returns a current-tab candidate snapshot for GET_CANDIDATES', async () => {
    const candidateRegistry = createCandidateRegistry();
    const tabSnapshots = createTabSnapshotStore();
    const snapshot = buildActiveTabSnapshot({ tabId: 42, title: 'Current tab' });
    const candidates = [
      buildCandidate({ id: 'candidate-a', tabId: 42, displayName: 'A' }),
      buildCandidate({ id: 'candidate-b', tabId: 42, displayName: 'B' }),
    ];

    tabSnapshots.set(snapshot);
    candidateRegistry.set(snapshot.tabId, candidates);

    const router = createRuntimeRouter({
      candidateRegistry,
      tabSnapshots,
    });

    const response = await router.handleMessage(
      createRuntimeRequest('GET_CANDIDATES', { tabId: 42 }, 'req-1'),
      {
        tab: { id: 42 },
      } as chrome.runtime.MessageSender,
    );

    expect(tabSnapshots.get(42)).toEqual(snapshot);
    expect(response).toEqual(
      createRuntimeResponse(
        'GET_CANDIDATES_RESULT',
        { candidates },
        'req-1',
      ),
    );
  });

  test('returns a queue stats shell for GET_QUEUE_STATS', async () => {
    const router = createRuntimeRouter({
      candidateRegistry: createCandidateRegistry(),
      tabSnapshots: createTabSnapshotStore(),
    });

    const response = await router.handleMessage(
      createRuntimeRequest('GET_QUEUE_STATS', {}, 'req-2'),
    );

    expect(response).toEqual(
      createRuntimeResponse(
        'GET_QUEUE_STATS_RESULT',
        {
          stats: {
            queued: 0,
            running: 0,
            failed: 0,
            completed: 0,
          },
        },
        'req-2',
      ),
    );
  });
});
