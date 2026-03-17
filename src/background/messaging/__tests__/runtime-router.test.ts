import { createCandidateRegistry } from '@/src/background/candidates/candidate-registry';
import { createHistoryStore } from '@/src/background/jobs/history-store';
import { createJobStore } from '@/src/background/jobs/job-store';
import { createRequestJournal } from '@/src/background/network/request-journal';
import { createTabSnapshotStore } from '@/src/background/state/tab-snapshots';
import { createRuntimeRequest } from '@/src/shared/contracts/messages';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { createRuntimeRouter, registerRuntimeRouter } from '../runtime-router';

const hlsMaster = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=1280x720',
  'video_720p.m3u8',
].join('\n');

const dashManifest = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT6S">
  <Period>
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation id="v1" bandwidth="750000" width="1280" height="720">
        <SegmentTemplate initialization="init.mp4" media="seg-$Number$.m4s" startNumber="1" duration="6" />
      </Representation>
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="audio/mp4" lang="en">
      <Representation id="a1" bandwidth="128000">
        <SegmentTemplate initialization="init.mp4" media="seg-$Number$.m4s" startNumber="1" duration="6" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

const protectedDashManifest = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT6S">
  <Period>
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />
      <Representation id="drm-v1" bandwidth="750000" width="1280" height="720">
        <SegmentTemplate initialization="init.mp4" media="seg-$Number$.m4s" startNumber="1" duration="6" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

function buildRouter() {
  const candidateRegistry = createCandidateRegistry();
  const requestJournal = createRequestJournal();
  const tabSnapshots = createTabSnapshotStore();
  const fetchManifest = vi.fn(async (url: string) => {
    if (url.endsWith('/hls/master.m3u8')) {
      return hlsMaster;
    }
    if (url.endsWith('/dash/manifest-with-tracks.mpd')) {
      return dashManifest;
    }
    if (url.endsWith('/protected/drm.mpd')) {
      return protectedDashManifest;
    }

    throw new Error(`Unexpected manifest URL: ${url}`);
  });
  const router = createRuntimeRouter({
    candidateRegistry,
    tabSnapshots,
    requestJournal,
    fetchManifest,
  });

  return { candidateRegistry, requestJournal, router, fetchManifest };
}

test('GET_CANDIDATES hydrates passive request journal evidence for a queried tab', async () => {
  const { requestJournal, router } = buildRouter();

  requestJournal.addRequest(7, {
    url: 'http://127.0.0.1:4173/media/sample.mp4',
    initiator: 'http://127.0.0.1:4173/index.html',
    responseHeaders: [{ name: 'content-type', value: 'video/mp4' }],
    timeStamp: 1,
  });
  requestJournal.addRequest(7, {
    url: 'http://127.0.0.1:4173/hls/master.m3u8',
    initiator: 'http://127.0.0.1:4173/index.html',
    responseHeaders: [
      { name: 'content-type', value: 'application/vnd.apple.mpegurl' },
    ],
    timeStamp: 2,
  });
  requestJournal.addRequest(7, {
    url: 'http://127.0.0.1:4173/dash/manifest-with-tracks.mpd',
    initiator: 'http://127.0.0.1:4173/index.html',
    responseHeaders: [{ name: 'content-type', value: 'application/dash+xml' }],
    timeStamp: 3,
  });
  requestJournal.addRequest(7, {
    url: 'http://127.0.0.1:4173/protected/drm.mpd',
    initiator: 'http://127.0.0.1:4173/index.html',
    responseHeaders: [{ name: 'content-type', value: 'application/dash+xml' }],
    timeStamp: 4,
  });

  const response = await router.handleMessage(
    createRuntimeRequest('GET_CANDIDATES', { tabId: 7 }, 'req-1'),
  );

  expect(response.type).toBe('GET_CANDIDATES_RESULT');
  if (response.type !== 'GET_CANDIDATES_RESULT') {
    return;
  }

  expect(response.payload.candidates).toHaveLength(4);
  expect(
    response.payload.candidates.find((candidate) => candidate.protocol === 'hls')
      ?.variants,
  ).toEqual([expect.objectContaining({ height: 720, bitrate: 900_000 })]);
  expect(
    response.payload.candidates.find(
      (candidate) =>
        candidate.protocol === 'dash' && candidate.protection.kind === 'none',
    )?.audioTracks,
  ).toEqual([expect.objectContaining({ id: 'a1', language: 'en' })]);
  expect(
    response.payload.candidates.find(
      (candidate) => candidate.protection.kind === 'drm',
    ),
  ).toMatchObject({ status: 'protected' });
});

test('GET_CANDIDATES fetches HLS variant durations with a four-request limit', async () => {
  const candidateRegistry = createCandidateRegistry();
  const requestJournal = createRequestJournal();
  const tabSnapshots = createTabSnapshotStore();
  let runningLevels = 0;
  let maxRunningLevels = 0;
  const fetchManifest = vi.fn(async (url: string) => {
    if (url.endsWith('/hls/master.m3u8')) {
      return [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=100000',
        'level-1.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=200000',
        'level-2.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=300000',
        'level-3.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=400000',
        'level-4.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=500000',
        'level-5.m3u8',
      ].join('\n');
    }
    if (url.includes('level-')) {
      runningLevels += 1;
      maxRunningLevels = Math.max(maxRunningLevels, runningLevels);
      await new Promise((resolve) => setTimeout(resolve, 0));
      runningLevels -= 1;
      return ['#EXTM3U', '#EXTINF:10,', 'segment.ts'].join('\n');
    }
    throw new Error(`Unexpected manifest URL: ${url}`);
  });
  const router = createRuntimeRouter({
    candidateRegistry,
    tabSnapshots,
    requestJournal,
    fetchManifest,
  });
  requestJournal.addRequest(7, {
    url: 'http://127.0.0.1:4173/hls/master.m3u8',
    initiator: 'http://127.0.0.1:4173/index.html',
    responseHeaders: [
      { name: 'content-type', value: 'application/vnd.apple.mpegurl' },
    ],
    timeStamp: 2,
  });

  const response = await router.handleMessage(
    createRuntimeRequest('GET_CANDIDATES', { tabId: 7 }, 'req-duration'),
  );

  expect(response.type).toBe('GET_CANDIDATES_RESULT');
  if (response.type !== 'GET_CANDIDATES_RESULT') return;
  expect(maxRunningLevels).toBe(4);
  expect(response.payload.candidates[0]).toMatchObject({ durationSec: 10 });
});

test('GET_ALL_CANDIDATES aggregates candidates across registered tabs', async () => {
  const candidateRegistry = createCandidateRegistry();
  const router = createRuntimeRouter({
    candidateRegistry,
    tabSnapshots: createTabSnapshotStore(),
  });
  candidateRegistry.set(1, [{
    id: 'a',
    tabId: 1,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://a.example/',
    origin: 'https://a.example',
    displayName: 'A',
    sourceUrl: 'https://a.example/a.mp4',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 1,
    updatedAt: 1,
  }]);
  candidateRegistry.set(2, [{
    id: 'b',
    tabId: 2,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://b.example/',
    origin: 'https://b.example',
    displayName: 'B',
    sourceUrl: 'https://b.example/b.mp4',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 1,
    updatedAt: 1,
  }]);

  const response = await router.handleMessage(
    createRuntimeRequest('GET_ALL_CANDIDATES', {}, 'req-all'),
  );

  expect(response.type).toBe('GET_ALL_CANDIDATES_RESULT');
  if (response.type !== 'GET_ALL_CANDIDATES_RESULT') return;
  expect(response.payload.candidates.map((candidate) => candidate.id)).toEqual(['a', 'b']);
});

test('GET_ALL_CANDIDATES hydrates passive request evidence across journal tabs', async () => {
  const { requestJournal, router } = buildRouter();

  requestJournal.addRequest(7, {
    url: 'http://127.0.0.1:4173/media/current.mp4',
    initiator: 'http://127.0.0.1:4173/current.html',
    responseHeaders: [{ name: 'content-type', value: 'video/mp4' }],
    timeStamp: 1,
  });
  requestJournal.addRequest(8, {
    url: 'http://127.0.0.1:4173/media/other.mp4',
    initiator: 'http://127.0.0.1:4173/other.html',
    responseHeaders: [{ name: 'content-type', value: 'video/mp4' }],
    timeStamp: 2,
  });

  const response = await router.handleMessage(
    createRuntimeRequest('GET_ALL_CANDIDATES', {}, 'req-all-journal'),
  );

  expect(response.type).toBe('GET_ALL_CANDIDATES_RESULT');
  if (response.type !== 'GET_ALL_CANDIDATES_RESULT') return;
  expect(response.payload.candidates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ tabId: 7, sourceUrl: 'http://127.0.0.1:4173/media/current.mp4' }),
      expect.objectContaining({ tabId: 8, sourceUrl: 'http://127.0.0.1:4173/media/other.mp4' }),
    ]),
  );
});

test('CLEAN_EXTENSION_STORAGE delegates to background storage cleanup', async () => {
  const cleanupResult = {
    orphanedFragmentBuckets: 2,
    activeJobBuckets: 3,
    removedStorageKeys: ['unshackle:previousDetections'],
  };
  const cleanupExtensionStorage = vi.fn(async () => cleanupResult);
  const router = createRuntimeRouter({
    candidateRegistry: createCandidateRegistry(),
    tabSnapshots: createTabSnapshotStore(),
    cleanupExtensionStorage,
  });

  const response = await router.handleMessage(
    createRuntimeRequest('CLEAN_EXTENSION_STORAGE', {}, 'req-clean-storage'),
  );

  expect(cleanupExtensionStorage).toHaveBeenCalledTimes(1);
  expect(response).toEqual({
    type: 'CLEAN_EXTENSION_STORAGE_RESULT',
    requestId: 'req-clean-storage',
    payload: cleanupResult,
  });
});

test('GET_JOBS and queue actions expose production download queue operations', async () => {
  const candidateRegistry = createCandidateRegistry();
  const jobStore = createJobStore(() => 1);
  const historyStore = createHistoryStore(() => 1);
  const candidate: MediaCandidate = {
    id: 'direct-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/',
    origin: 'https://example.com',
    displayName: 'Direct',
    sourceUrl: 'https://cdn.example.com/direct.mp4',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 1,
    updatedAt: 1,
  };
  candidateRegistry.set(7, [candidate]);
  const downloadQueue = {
    enqueue: vi.fn(() => jobStore.create(candidate, { mode: 'best' })),
    drain: vi.fn(async () => undefined),
    stats: vi.fn(),
    retry: vi.fn(() => true),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    removeQueued: vi.fn(),
    clearCompleted: vi.fn(() => ['job-1']),
  };
  const job = jobStore.create(candidate, { mode: 'best' });
  jobStore.update(job.id, { phase: 'failed' });
  const cleanupJobStorage = vi.fn(async () => undefined);
  const router = createRuntimeRouter({
    candidateRegistry,
    tabSnapshots: createTabSnapshotStore(),
    jobStore,
    historyStore,
    downloadQueue,
    cleanupJobStorage,
  });

  expect(await router.handleMessage(createRuntimeRequest('GET_JOBS', {}, 'req-jobs')))
    .toMatchObject({ type: 'GET_JOBS_RESULT' });
  await router.handleMessage(createRuntimeRequest('RETRY_DOWNLOAD', { jobId: job.id }, 'req-retry'));
  expect(downloadQueue.retry).toHaveBeenCalledWith(job.id);
  await router.handleMessage(createRuntimeRequest('RESAVE_DOWNLOAD', { jobId: job.id }, 'req-resave'));
  expect(downloadQueue.enqueue).toHaveBeenCalledWith(candidate, job.selection);
  await router.handleMessage(createRuntimeRequest('REMOVE_DOWNLOAD', { jobId: job.id }, 'req-remove'));
  expect(jobStore.get(job.id)).toBeUndefined();
  expect(cleanupJobStorage).toHaveBeenCalledWith(job.id);
});

test('INGEST_CONTENT_EVIDENCE stores DOM HLS manifests for the sender tab', async () => {
  const { router } = buildRouter();

  const response = await router.handleMessage(
    createRuntimeRequest(
      'INGEST_CONTENT_EVIDENCE',
      {
        pageUrl: 'http://127.0.0.1:4173/index.html',
        pageTitle: 'Fixture page',
        evidence: [
          {
            source: 'dom',
            confidence: 0.85,
            url: 'http://127.0.0.1:4173/hls/master.m3u8',
            notes: ['tag:video'],
            createdAt: 1,
            mediaKind: 'video',
            pageUrl: 'http://127.0.0.1:4173/index.html',
            sources: [{ url: 'http://127.0.0.1:4173/hls/master.m3u8' }],
            tracks: [],
          } as never,
        ],
      },
      'req-content',
    ),
    {
      tab: {
        id: 7,
        url: 'http://127.0.0.1:4173/index.html',
        title: 'Fixture page',
      } as chrome.tabs.Tab,
      frameId: 0,
    },
  );

  expect(response.type).toBe('INGEST_CONTENT_EVIDENCE_RESULT');

  const candidatesResponse = await router.handleMessage(
    createRuntimeRequest('GET_CANDIDATES', { tabId: 7 }, 'req-candidates'),
  );

  expect(candidatesResponse.type).toBe('GET_CANDIDATES_RESULT');
  if (candidatesResponse.type !== 'GET_CANDIDATES_RESULT') {
    return;
  }

  expect(candidatesResponse.payload.candidates).toEqual([
    expect.objectContaining({
      protocol: 'hls',
      manifestUrl: 'http://127.0.0.1:4173/hls/master.m3u8',
      protection: { kind: 'none' },
    }),
  ]);
});

test('INGEST_CONTENT_EVIDENCE records only newly created detections', async () => {
  const recordDetection = vi.fn();
  const router = createRuntimeRouter({
    candidateRegistry: createCandidateRegistry(),
    tabSnapshots: createTabSnapshotStore(),
    recordDetection,
  });
  const request = createRuntimeRequest(
    'INGEST_CONTENT_EVIDENCE',
    {
      pageUrl: 'https://example.com/watch',
      pageTitle: 'Fixture page',
      evidence: [
        {
          source: 'dom',
          confidence: 0.85,
          url: 'https://cdn.example.com/master.m3u8',
          notes: ['tag:video'],
          createdAt: 1,
          mediaKind: 'video',
          pageUrl: 'https://example.com/watch',
          sources: [{ url: 'https://cdn.example.com/master.m3u8' }],
          tracks: [],
        } as never,
      ],
    },
    'req-content-notify',
  );
  const sender = {
    tab: {
      id: 7,
      url: 'https://example.com/watch',
      title: 'Fixture page',
    } as chrome.tabs.Tab,
    frameId: 0,
  };

  await router.handleMessage(request, sender);
  await router.handleMessage(request, sender);

  expect(recordDetection).toHaveBeenCalledTimes(1);
  expect(recordDetection).toHaveBeenCalledWith('example.com', 1);
});

test('INGEST_MANUAL_HLS stores URL and raw-list candidates for the requested tab', async () => {
  const { router } = buildRouter();

  const response = await router.handleMessage(
    createRuntimeRequest(
      'INGEST_MANUAL_HLS',
      {
        tabId: 7,
        pageUrl: 'http://127.0.0.1:4173/index.html',
        pageTitle: 'Manual page',
        input: 'seg-1.ts\nseg-2.ts',
        baseUrl: 'http://127.0.0.1:4173/hls/master.m3u8',
      },
      'req-manual-hls',
    ),
  );

  expect(response.type).toBe('INGEST_MANUAL_HLS_RESULT');
  if (response.type !== 'INGEST_MANUAL_HLS_RESULT') {
    return;
  }

  expect(response.payload.candidates).toEqual([
    expect.objectContaining({
      protocol: 'hls',
      pageTitle: 'Manual page',
      manifestUrl: expect.stringMatching(/^data:application\/vnd\.apple\.mpegurl/),
      evidence: [
        expect.objectContaining({
          source: 'user',
          notes: expect.arrayContaining(['manual-ingest:raw-ts-list']),
        }),
      ],
    }),
  ]);
});

test('START_DOWNLOAD can find a candidate loaded for the side panel without sender tab context', async () => {
  const candidateRegistry = createCandidateRegistry();
  const router = createRuntimeRouter({
    candidateRegistry,
    tabSnapshots: createTabSnapshotStore(),
    jobStore: createJobStore(() => 1),
    historyStore: createHistoryStore(() => 1),
    downloadFile: vi.fn(async () => ({
      fileName: 'sample.mp4',
      mimeType: 'video/mp4',
      downloadId: 77,
    })),
  });
  candidateRegistry.set(7, [
    {
      id: 'direct-1',
      tabId: 7,
      mediaKind: 'video',
      protocol: 'direct',
      status: 'ready',
      pageUrl: 'http://127.0.0.1:4173/index.html',
      origin: 'http://127.0.0.1:4173',
      displayName: 'sample.mp4',
      sourceUrl: 'http://127.0.0.1:4173/media/sample.mp4',
      fileExtensionHint: 'mp4',
      protection: { kind: 'none' },
      variants: [],
      audioTracks: [],
      subtitleTracks: [],
      evidence: [],
      preview: { playable: true, adapter: 'native' },
      createdAt: 1,
      updatedAt: 1,
    },
  ]);

  const response = await router.handleMessage(
    createRuntimeRequest(
      'START_DOWNLOAD',
      { candidateId: 'direct-1', selection: { mode: 'best' } },
      'req-2',
    ),
  );

  expect(response.type).toBe('START_DOWNLOAD_RESULT');
});

test('CANCEL_DOWNLOAD delegates to the configured runtime cancellation path', async () => {
  const cancelDownload = vi.fn(async () => ({ cancelled: true, downloadId: 77 }));
  const cleanupJobStorage = vi.fn(async () => undefined);
  const router = createRuntimeRouter({
    candidateRegistry: createCandidateRegistry(),
    tabSnapshots: createTabSnapshotStore(),
    cancelDownload,
    cleanupJobStorage,
  });

  const response = await router.handleMessage(
    createRuntimeRequest('CANCEL_DOWNLOAD', { jobId: 'job-1' }, 'req-cancel'),
  );

  expect(cancelDownload).toHaveBeenCalledWith('job-1');
  expect(cleanupJobStorage).toHaveBeenCalledWith('job-1');
  expect(response).toEqual({
    type: 'CANCEL_DOWNLOAD_RESULT',
    requestId: 'req-cancel',
    payload: { cancelled: true, downloadId: 77 },
  });
});

test('REQUEST_HOST_ACCESS delegates runtime origin grants through the permissions API', async () => {
  const requestHostAccess = vi.fn(async () => true);
  const router = createRuntimeRouter({
    candidateRegistry: createCandidateRegistry(),
    tabSnapshots: createTabSnapshotStore(),
    requestHostAccess,
  });

  const response = await router.handleMessage(
    createRuntimeRequest(
      'REQUEST_HOST_ACCESS',
      { origin: 'https://media.example.com' },
      'req-host',
    ),
  );

  expect(requestHostAccess).toHaveBeenCalledWith('https://media.example.com/*');
  expect(response).toMatchObject({
    type: 'REQUEST_HOST_ACCESS_RESULT',
    payload: {
      granted: true,
      origin: 'https://media.example.com',
    },
  });
});

test('REQUEST_HOST_ACCESS reports already-granted required host access without requesting it again', async () => {
  const contains = vi.fn(async () => true);
  const request = vi.fn(async () => {
    throw new Error('request should not be called for already-granted origins');
  });
  vi.stubGlobal('chrome', {
    permissions: {
      contains,
      request,
    },
  });
  const router = createRuntimeRouter({
    candidateRegistry: createCandidateRegistry(),
    tabSnapshots: createTabSnapshotStore(),
  });

  const response = await router.handleMessage(
    createRuntimeRequest(
      'REQUEST_HOST_ACCESS',
      { origin: 'https://media.example.com' },
      'req-host-contained',
    ),
  );

  expect(contains).toHaveBeenCalledWith({
    origins: ['https://media.example.com/*'],
  });
  expect(request).not.toHaveBeenCalled();
  expect(response).toMatchObject({
    type: 'REQUEST_HOST_ACCESS_RESULT',
    payload: {
      granted: true,
      origin: 'https://media.example.com',
    },
  });
  vi.unstubAllGlobals();
});

test('DEBUG_GET_EVIDENCE returns candidate evidence without exposing raw request headers', async () => {
  const candidateRegistry = createCandidateRegistry();
  const router = createRuntimeRouter({
    candidateRegistry,
    tabSnapshots: createTabSnapshotStore(),
  });

  candidateRegistry.set(7, [
    {
      id: 'candidate-debug',
      tabId: 7,
      mediaKind: 'video',
      protocol: 'direct',
      status: 'ready',
      pageUrl: 'https://example.com/watch',
      origin: 'https://example.com',
      displayName: 'video.mp4',
      sourceUrl: 'https://cdn.example.com/video.mp4',
      protection: { kind: 'none' },
      variants: [],
      audioTracks: [],
      subtitleTracks: [],
      evidence: [
        {
          source: 'network',
          confidence: 0.75,
          url: 'https://cdn.example.com/video.mp4',
          notes: ['category:direct_media'],
          createdAt: 1,
        },
      ],
      preview: { playable: true, adapter: 'native' },
      createdAt: 1,
      updatedAt: 1,
    },
  ]);

  const response = await router.handleMessage(
    createRuntimeRequest(
      'DEBUG_GET_EVIDENCE',
      { candidateId: 'candidate-debug' },
      'req-debug',
    ),
  );

  expect(response).toEqual({
    type: 'DEBUG_GET_EVIDENCE_RESULT',
    requestId: 'req-debug',
    payload: {
      evidence: [
        {
          source: 'network',
          confidence: 0.75,
          url: 'https://cdn.example.com/video.mp4',
          notes: ['category:direct_media'],
          createdAt: 1,
        },
      ],
    },
  });
});

test('INGEST_IQIYI_CONFIG stores HLS candidates from iQIYI MAIN-world bridge', async () => {
  const { router, candidateRegistry } = buildRouter();

  const sender = {
    tab: {
      id: 9,
      url: 'https://www.iqiyi.com/v_fixture.html',
      title: 'iQIYI Fixture',
    } as chrome.tabs.Tab,
    frameId: 0,
  };

  const response = await router.handleMessage(
    createRuntimeRequest(
      'INGEST_IQIYI_CONFIG',
      {
        pageUrl: 'https://www.iqiyi.com/v_fixture.html',
        title: 'iQIYI Fixture',
        m3u8Urls: ['https://iqiyi.example/stream/master.m3u8'],
      },
      'req-iqiyi',
    ),
    sender,
  );

  expect(response.type).toBe('INGEST_IQIYI_CONFIG_RESULT');
  if (response.type !== 'INGEST_IQIYI_CONFIG_RESULT') return;

  expect(response.payload.candidates).toHaveLength(1);
  expect(response.payload.candidates[0]).toMatchObject({
    protocol: 'hls',
    pageTitle: 'iQIYI Fixture',
    pageUrl: 'https://www.iqiyi.com/v_fixture.html',
  });
  expect(candidateRegistry.get(9)).toHaveLength(1);
});

test('INGEST_IQIYI_CONFIG returns NO_SENDER_TAB error when sent without a tab', async () => {
  const { router } = buildRouter();

  const response = await router.handleMessage(
    createRuntimeRequest(
      'INGEST_IQIYI_CONFIG',
      {
        pageUrl: 'https://www.iqiyi.com/v_fixture.html',
        title: 'iQIYI Fixture',
        m3u8Urls: ['https://iqiyi.example/stream/master.m3u8'],
      },
      'req-iqiyi-notab',
    ),
  );

  expect(response.type).toBe('ERROR');
  if (response.type !== 'ERROR') return;
  expect(response.payload.code).toBe('NO_SENDER_TAB');
});

test('DRM_DETECTED records detections in the drmDetections map', async () => {
  const drmDetections = new Map();
  const router = createRuntimeRouter({
    candidateRegistry: createCandidateRegistry(),
    tabSnapshots: createTabSnapshotStore(),
    drmDetections,
  });

  const response = await router.handleMessage(
    createRuntimeRequest(
      'DRM_DETECTED',
      {
        drmName: 'Widevine',
        trigger: 'keySystemRequest',
        url: 'https://video.example.com/watch',
      },
      'req-drm',
    ),
  );

  expect(response.type).toBe('DRM_DETECTED_RESULT');
  if (response.type !== 'DRM_DETECTED_RESULT') return;
  expect(response.payload.ok).toBe(true);
  expect(drmDetections.get('https://video.example.com/watch')).toEqual([
    expect.objectContaining({
      drmName: 'Widevine',
      trigger: 'keySystemRequest',
      url: 'https://video.example.com/watch',
    }),
  ]);
});

test('DRM_DETECTED deduplicates repeated reports for the same DRM system', async () => {
  const drmDetections = new Map();
  const router = createRuntimeRouter({
    candidateRegistry: createCandidateRegistry(),
    tabSnapshots: createTabSnapshotStore(),
    drmDetections,
  });
  const payload = {
    drmName: 'Widevine',
    trigger: 'keySystemRequest',
    url: 'https://video.example.com/watch',
  };

  await router.handleMessage(
    createRuntimeRequest('DRM_DETECTED', payload, 'req-drm-1'),
  );
  await router.handleMessage(
    createRuntimeRequest('DRM_DETECTED', payload, 'req-drm-2'),
  );

  expect(drmDetections.get('https://video.example.com/watch')).toHaveLength(1);
});

test('registerRuntimeRouter returns an error response when an async handler throws', async () => {
  const listeners: Array<(
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => boolean | void> = [];
  const runtime = {
    onMessage: {
      addListener: vi.fn((listener) => listeners.push(listener)),
    },
  };
  const router = {
    canHandleMessage: vi.fn(() => true),
    handleMessage: vi.fn(async () => {
      throw new Error('manifest unavailable');
    }),
  };
  const sendResponse = vi.fn();

  registerRuntimeRouter(router, runtime as unknown as typeof chrome.runtime);
  const keepAlive = listeners[0]?.(
    createRuntimeRequest(
      'INGEST_MANUAL_HLS',
      {
        tabId: 7,
        pageUrl: 'https://example.com/watch',
        input: 'https://cdn.example.com/hls/master.m3u8',
      },
      'req-async-error',
    ),
    {},
    sendResponse,
  );

  expect(keepAlive).toBe(true);
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'ERROR',
      requestId: 'req-async-error',
      payload: expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'manifest unavailable',
      }),
    }),
  );
});
