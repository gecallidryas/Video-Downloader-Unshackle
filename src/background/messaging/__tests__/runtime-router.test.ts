import { createCandidateRegistry } from '@/src/background/candidates/candidate-registry';
import { createHistoryStore } from '@/src/background/jobs/history-store';
import { createJobStore } from '@/src/background/jobs/job-store';
import { createRequestJournal } from '@/src/background/network/request-journal';
import { createTabSnapshotStore } from '@/src/background/state/tab-snapshots';
import { createRuntimeRequest } from '@/src/shared/contracts/messages';
import { createRuntimeRouter } from '../runtime-router';

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
