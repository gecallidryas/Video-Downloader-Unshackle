import type {
  MediaCandidate,
  PreviewCapability,
  ProtectionInfo,
} from '@/video_downloader_types_skeleton';
import { classifyCandidate } from '@/src/core/candidates/classify-candidate';
import { parseMpd } from '@/src/core/dash/parse-mpd';
import { parseHlsManifest } from '@/src/core/hls/parse-hls-manifest';
import { collectPageContext } from '@/src/content/dom/collect-page-context';
import { scanMediaElements } from '@/src/content/dom/scan-media-elements';

export interface UnifiedFixtureBundle {
  baseUrl: string;
  pageHtml: string;
  hlsMaster: string;
  dashManifest: string;
  protectedDashManifest: string;
  remoteConfig: string;
}

export interface UnifiedFixtureLoaderOptions {
  tabId?: number;
  now?: () => number;
}

function fixtureUrl(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\//, ''), baseUrl).toString();
}

function candidateTimestamps(now: number) {
  return {
    createdAt: now,
    updatedAt: now,
  };
}

function previewForProtection(protection: ProtectionInfo): PreviewCapability {
  if (protection.kind === 'drm' || protection.kind === 'unknown') {
    return { playable: false, adapter: 'none', reason: protection.reason };
  }

  return { playable: false, adapter: 'none' };
}

function parseFixtureDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function buildDirectCandidate(
  bundle: UnifiedFixtureBundle,
  tabId: number,
  now: () => number,
): MediaCandidate {
  const pageUrl = fixtureUrl(bundle.baseUrl, '/index.html');
  const documentRef = parseFixtureDocument(bundle.pageHtml);
  const pageContext = collectPageContext(documentRef, { pageUrl });
  const directEvidence = scanMediaElements(documentRef, {
    pageUrl,
    pageContext,
    now,
  }).find((evidence) => evidence.url?.endsWith('/media/sample.mp4'));

  return classifyCandidate({
    tabId,
    pageUrl,
    pageTitle: pageContext.pageTitle,
    pageContext,
    evidence: directEvidence
      ? [directEvidence]
      : [
          {
            source: 'network',
            confidence: 0.75,
            url: fixtureUrl(bundle.baseUrl, '/media/sample.mp4'),
            initiatorUrl: pageUrl,
            notes: ['category:direct_media'],
            createdAt: now(),
          },
        ],
    now,
  });
}

function buildHlsCandidate(
  bundle: UnifiedFixtureBundle,
  tabId: number,
  now: number,
): MediaCandidate {
  const manifestUrl = fixtureUrl(bundle.baseUrl, '/hls/master.m3u8');
  const manifest = parseHlsManifest({
    manifestUrl,
    content: bundle.hlsMaster,
  });

  return {
    id: 'fixture-hls-clear',
    tabId,
    mediaKind: 'video',
    protocol: 'hls',
    status: manifest.protection.kind === 'none' ? 'partial' : 'protected',
    pageUrl: fixtureUrl(bundle.baseUrl, '/index.html'),
    pageTitle: 'Fixture Page Title',
    origin: new URL(bundle.baseUrl).origin,
    displayName: 'Fixture HLS stream',
    manifestUrl,
    protection: manifest.protection,
    variants: manifest.variants,
    audioTracks: manifest.audioTracks,
    subtitleTracks: manifest.subtitleTracks,
    evidence: [
      {
        source: 'network',
        confidence: 0.75,
        url: manifestUrl,
        notes: ['category:hls_manifest'],
        createdAt: now,
      },
    ],
    preview: previewForProtection(manifest.protection),
    ...candidateTimestamps(now),
  };
}

function buildDashCandidate(
  bundle: UnifiedFixtureBundle,
  tabId: number,
  now: number,
  options: { protected: boolean },
): MediaCandidate {
  const manifestUrl = fixtureUrl(
    bundle.baseUrl,
    options.protected ? '/protected/drm.mpd' : '/dash/manifest-with-tracks.mpd',
  );
  const manifest = parseMpd({
    manifestUrl,
    content: options.protected ? bundle.protectedDashManifest : bundle.dashManifest,
  });

  return {
    id: options.protected ? 'fixture-dash-drm' : 'fixture-dash-clear',
    tabId,
    mediaKind: 'video',
    protocol: 'dash',
    status: manifest.protection.kind === 'none' ? 'partial' : 'protected',
    pageUrl: fixtureUrl(bundle.baseUrl, '/index.html'),
    pageTitle: 'Fixture Page Title',
    origin: new URL(bundle.baseUrl).origin,
    displayName: options.protected ? 'Protected fixture DASH stream' : 'Fixture DASH stream',
    manifestUrl,
    protection: manifest.protection,
    variants: manifest.variants,
    audioTracks: manifest.audioTracks,
    subtitleTracks: manifest.subtitleTracks,
    evidence: [
      {
        source: 'network',
        confidence: 0.75,
        url: manifestUrl,
        notes: options.protected
          ? ['category:dash_manifest', 'drm:widevine']
          : ['category:dash_manifest'],
        createdAt: now,
      },
    ],
    preview: previewForProtection(manifest.protection),
    ...candidateTimestamps(now),
  };
}

function buildRestrictedCandidate(
  bundle: UnifiedFixtureBundle,
  tabId: number,
  now: number,
): MediaCandidate {
  return {
    id: 'fixture-blocked-remote-config',
    tabId,
    mediaKind: 'video',
    protocol: 'unknown',
    status: 'unsupported',
    pageUrl: fixtureUrl(bundle.baseUrl, '/remote/unsigned-config.json'),
    pageTitle: 'Unsigned remote config fixture',
    origin: new URL(bundle.baseUrl).origin,
    displayName: 'Blocked fixture stream',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [
      {
        source: 'player-config',
        confidence: 0.3,
        url: fixtureUrl(bundle.baseUrl, '/remote/unsigned-config.json'),
        notes: ['restriction:unsigned-remote-config', 'category:blocked_fixture'],
        createdAt: now,
      },
    ],
    preview: {
      playable: false,
      adapter: 'none',
      reason: 'Unsigned remote config fixtures are policy-only.',
    },
    ...candidateTimestamps(now),
  };
}

export function loadUnifiedFixtureCandidates(
  bundle: UnifiedFixtureBundle,
  options: UnifiedFixtureLoaderOptions = {},
): MediaCandidate[] {
  const tabId = options.tabId ?? 1;
  const now = options.now ?? Date.now;
  const timestamp = now();

  return [
    buildDirectCandidate(bundle, tabId, now),
    buildHlsCandidate(bundle, tabId, timestamp),
    buildDashCandidate(bundle, tabId, timestamp, { protected: false }),
    buildDashCandidate(bundle, tabId, timestamp, { protected: true }),
    buildRestrictedCandidate(bundle, tabId, timestamp),
  ];
}
