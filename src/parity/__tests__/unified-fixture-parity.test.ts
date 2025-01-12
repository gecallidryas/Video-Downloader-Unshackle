import pageHtml from '../../../test-fixtures/demo-server/site/index.html?raw';
import hlsMaster from '../../../test-fixtures/demo-server/site/hls/master.m3u8?raw';
import dashManifest from '../../../test-fixtures/demo-server/site/dash/manifest-with-tracks.mpd?raw';
import protectedDashManifest from '../../../test-fixtures/demo-server/site/protected/drm.mpd?raw';
import remoteConfig from '../../../test-fixtures/demo-server/site/remote/unsigned-config.json?raw';
import {
  loadUnifiedFixtureCandidates,
  type UnifiedFixtureBundle,
} from '../unified-fixture-loader';

const bundle: UnifiedFixtureBundle = {
  baseUrl: 'http://127.0.0.1:4173/',
  pageHtml,
  hlsMaster,
  dashManifest,
  protectedDashManifest,
  remoteConfig,
};

test('copies deterministic source fixtures needed by the parity harness', () => {
  expect(pageHtml).toContain('runFixtureRequests');
  expect(pageHtml).toContain('/media/sample.mp4');
  expect(pageHtml).toContain('/hls/master.m3u8');
  expect(pageHtml).toContain('/dash/manifest.mpd');
  expect(hlsMaster).toContain('#EXT-X-STREAM-INF');
  expect(dashManifest).toContain('contentType="audio"');
  expect(protectedDashManifest).toContain('ContentProtection');
  expect(remoteConfig).toContain('Unsigned fixture config');
});

test('normalizes unified fixtures into target media candidates', () => {
  const candidates = loadUnifiedFixtureCandidates(bundle, {
    tabId: 11,
    now: () => 1_700_000_000_000,
  });

  expect(candidates.map((candidate) => candidate.protocol)).toEqual([
    'direct',
    'hls',
    'dash',
    'dash',
    'unknown',
  ]);

  const direct = candidates.find((candidate) => candidate.protocol === 'direct');
  expect(direct).toMatchObject({
    tabId: 11,
    mediaKind: 'video',
    status: 'ready',
    sourceUrl: 'http://127.0.0.1:4173/media/sample.mp4',
    protection: { kind: 'none' },
    preview: { playable: true, adapter: 'native' },
  });
  expect(direct?.thumbnails?.heroUrl).toBe(
    'http://127.0.0.1:4173/media/cover.png',
  );

  const hls = candidates.find((candidate) => candidate.protocol === 'hls');
  expect(hls).toMatchObject({
    status: 'partial',
    manifestUrl: 'http://127.0.0.1:4173/hls/master.m3u8',
    protection: { kind: 'none' },
  });
  expect(hls?.variants).toEqual([
    expect.objectContaining({ height: 720, bitrate: 900_000 }),
  ]);

  const dash = candidates.find(
    (candidate) =>
      candidate.protocol === 'dash' && candidate.protection.kind === 'none',
  );
  expect(dash?.variants).toEqual([
    expect.objectContaining({ id: 'v1', height: 720 }),
  ]);
  expect(dash?.audioTracks).toEqual([
    expect.objectContaining({ id: 'a1', kind: 'audio', language: 'en' }),
  ]);

  const protectedCandidate = candidates.find(
    (candidate) => candidate.protection.kind === 'drm',
  );
  expect(protectedCandidate).toMatchObject({
    status: 'protected',
    preview: { playable: false, adapter: 'none' },
  });
  expect(protectedCandidate?.protection.drmSystems).toContain('widevine');

  const restricted = candidates.find(
    (candidate) => candidate.status === 'unsupported',
  );
  expect(restricted).toMatchObject({
    displayName: 'Blocked fixture stream',
    protection: { kind: 'none' },
  });
});
