import type {
  ActiveTabSnapshot,
  DownloadJob,
  DownloadPhase,
  MediaCandidate,
  MessageEnvelope,
  QueueStats,
  RuntimeRequest,
  RuntimeResponse,
  GeneratedAssetResult,
  ExtensionStorageCleanupResult,
  MediaAssetKind,
  MediaAssetState,
} from '@/video_downloader_types_skeleton';
import {
  createMessageEnvelope,
  createRuntimeErrorResponse,
  createRuntimeResponse,
} from '@/src/shared/contracts/messages';
import type { CandidateRegistry } from '@/src/background/candidates/candidate-registry';
import type { HistoryStore } from '@/src/background/jobs/history-store';
import type { JobStore } from '@/src/background/jobs/job-store';
import type { TabSnapshotStore } from '@/src/background/state/tab-snapshots';
import type { DownloadQueue } from '@/src/background/jobs/download-queue';
import type {
  NetworkRequestEvidence,
  RequestJournal,
} from '@/src/background/network/request-journal';
import { buildDownloadIntent } from '@/src/core/actions/action-policy';
import { parseMpd } from '@/src/core/dash/parse-mpd';
import {
  startDirectDownload,
  type DirectDownloadFile,
} from '@/src/core/direct/start-direct-download';
import { parseHlsManifest } from '@/src/core/hls/parse-hls-manifest';
import { createManualHlsIngestEvidence } from '@/src/core/hls/manual-hls-ingest';
import { fetchDurationsWithLimit } from '@/src/core/probe/duration-fetcher';
import type { CandidateEvidence } from '@/src/core/candidates/classify-candidate';

export interface DrmDetectionRecord {
  drmName: string;
  trigger: string;
  url: string;
  detectedAt: number;
}

// RESUME_ALL_DOWNLOADS is not (yet) part of the canonical RuntimeRequest union
// in the types skeleton, so its contract lives here alongside the handler that
// owns it. Defined as MessageEnvelopes so it composes with the skeleton unions.
export type ResumeAllDownloadsRequest = MessageEnvelope<
  'RESUME_ALL_DOWNLOADS',
  Record<string, never>
>;
export type ResumeAllDownloadsResult = MessageEnvelope<
  'RESUME_ALL_DOWNLOADS_RESULT',
  { resumedIds: string[] }
>;

export type RuntimeRouterRequest = RuntimeRequest | ResumeAllDownloadsRequest;
export type RuntimeRouterResponse = RuntimeResponse | ResumeAllDownloadsResult;

const PAUSEABLE_PHASES: readonly DownloadPhase[] = [
  'queued',
  'preparing',
  'fetching',
  'decrypting',
  'transmuxing',
  'assembling',
  'finalizing',
  'exporting',
];

export interface RuntimeRouterDependencies {
  candidateRegistry: CandidateRegistry;
  tabSnapshots: TabSnapshotStore;
  jobStore?: JobStore;
  historyStore?: HistoryStore;
  downloadQueue?: DownloadQueue;
  cancelDownload?: (jobId: string) => Promise<{ cancelled: boolean; downloadId?: number }>;
  cleanupJobStorage?: (jobId: string) => Promise<void>;
  cleanupExtensionStorage?: () => Promise<ExtensionStorageCleanupResult>;
  downloadFile?: DirectDownloadFile;
  requestJournal?: RequestJournal;
  fetchManifest?: (url: string) => Promise<string>;
  ensurePreviewClip?: (
    candidate: MediaCandidate,
    options: { format?: 'webm' | 'mp4' | 'gif' },
  ) => Promise<GeneratedAssetResult>;
  ensureThumbnail?: (candidate: MediaCandidate) => Promise<GeneratedAssetResult>;
  mediaAssetService?: {
    getState(candidateId: string): Promise<MediaAssetState[]>;
    queueAsset(
      candidate: MediaCandidate,
      kind: MediaAssetKind,
      options?: { priority?: 'visible' | 'hover' | 'background' },
    ): Promise<MediaAssetState>;
  };
  getQueueStats?: () => QueueStats | Promise<QueueStats>;
  requestHostAccess?: (originPattern: string) => Promise<boolean>;
  drmDetections?: Map<string, DrmDetectionRecord[]>;
  recordDetection?: (hostname: string, count: number) => void;
}

export interface RuntimeRouter {
  canHandleMessage(request: RuntimeRouterRequest): boolean;
  handleMessage(
    request: RuntimeRouterRequest,
    sender?: chrome.runtime.MessageSender,
  ): Promise<RuntimeRouterResponse>;
}

export interface RuntimeMessageHost {
  onMessage: {
    addListener(
      callback: (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: RuntimeRouterResponse) => void,
      ) => boolean | void,
    ): void;
  };
}

type RoutedRuntimeRequest = Extract<
  RuntimeRequest,
  {
    type:
      | 'INGEST_CONTENT_EVIDENCE'
      | 'INGEST_MANUAL_HLS'
      | 'INGEST_IQIYI_CONFIG'
      | 'DRM_DETECTED'
      | 'GET_CANDIDATES'
      | 'GET_ALL_CANDIDATES'
      | 'CLEAN_EXTENSION_STORAGE'
      | 'GET_QUEUE_STATS'
      | 'REQUEST_HOST_ACCESS'
      | 'GET_PREVIEW_ASSET'
      | 'GET_THUMBNAIL_ASSET'
      | 'GET_MEDIA_ASSET_STATE'
      | 'QUEUE_MEDIA_ASSET'
      | 'DEBUG_GET_EVIDENCE'
      | 'START_DOWNLOAD'
      | 'CANCEL_DOWNLOAD'
      | 'GET_JOB'
      | 'GET_JOBS'
      | 'RETRY_DOWNLOAD'
      | 'RESAVE_DOWNLOAD'
      | 'REMOVE_DOWNLOAD'
      | 'CLEAR_COMPLETED_DOWNLOADS'
      | 'PAUSE_ALL_DOWNLOADS'
      | 'INGEST_DIRECT_URL'
      // RESUME_ALL_DOWNLOADS is appended to the handled set below.
      | 'RETRY_HLS_SEGMENT'
      | 'RETRY_FAILED_HLS_SEGMENTS'
      | 'EXPORT_PARTIAL_HLS'
      | 'UPDATE_HLS_SEGMENT_RANGE'
      | 'RECOVER_HLS_EXPORT'
      | 'REPLACE_HLS_MANIFEST_URL';
  }
>;

const handledRequestTypes = new Set<
  RoutedRuntimeRequest['type'] | 'RESUME_ALL_DOWNLOADS'
>([
  'INGEST_CONTENT_EVIDENCE',
  'INGEST_MANUAL_HLS',
  'INGEST_IQIYI_CONFIG',
  'DRM_DETECTED',
  'GET_CANDIDATES',
  'GET_ALL_CANDIDATES',
  'CLEAN_EXTENSION_STORAGE',
  'GET_QUEUE_STATS',
  'REQUEST_HOST_ACCESS',
  'GET_PREVIEW_ASSET',
  'GET_THUMBNAIL_ASSET',
  'GET_MEDIA_ASSET_STATE',
  'QUEUE_MEDIA_ASSET',
  'DEBUG_GET_EVIDENCE',
  'START_DOWNLOAD',
  'CANCEL_DOWNLOAD',
  'GET_JOB',
  'GET_JOBS',
  'RETRY_DOWNLOAD',
  'RESAVE_DOWNLOAD',
  'REMOVE_DOWNLOAD',
  'CLEAR_COMPLETED_DOWNLOADS',
  'PAUSE_ALL_DOWNLOADS',
  'RESUME_ALL_DOWNLOADS',
  'INGEST_DIRECT_URL',
  'RETRY_HLS_SEGMENT',
  'RETRY_FAILED_HLS_SEGMENTS',
  'EXPORT_PARTIAL_HLS',
  'UPDATE_HLS_SEGMENT_RANGE',
  'RECOVER_HLS_EXPORT',
  'REPLACE_HLS_MANIFEST_URL',
]);

function buildDefaultQueueStats(): QueueStats {
  return {
    queued: 0,
    running: 0,
    failed: 0,
    completed: 0,
  };
}

function getCandidatePageUrl(
  tabId: number,
  evidence: NetworkRequestEvidence[],
  dependencies: RuntimeRouterDependencies,
): string {
  return (
    dependencies.tabSnapshots.get(tabId)?.url ??
    evidence.find((item) => item.initiatorUrl)?.initiatorUrl ??
    evidence[0]?.initiatorUrl ??
    evidence[0]?.url ??
    ''
  );
}

function getCandidatePageTitle(
  tabId: number,
  dependencies: RuntimeRouterDependencies,
): string | undefined {
  return dependencies.tabSnapshots.get(tabId)?.title;
}

function isCandidateEvidence(evidence: NetworkRequestEvidence): boolean {
  return (
    evidence.category === 'direct_media' ||
    evidence.category === 'hls_manifest' ||
    evidence.category === 'dash_manifest'
  );
}

function previewForCandidate(candidate: MediaCandidate): MediaCandidate['preview'] {
  if (
    candidate.protection.kind === 'drm' ||
    candidate.status === 'protected'
  ) {
    return {
      playable: false,
      adapter: 'none',
      reason: candidate.protection.reason,
    };
  }

  if (candidate.protocol === 'direct') {
    return { playable: true, adapter: 'native' };
  }

  return { playable: false, adapter: 'none' };
}

async function hydrateManifestCandidate(
  candidate: MediaCandidate,
  fetchManifest: RuntimeRouterDependencies['fetchManifest'],
): Promise<MediaCandidate> {
  if (!candidate.manifestUrl || !fetchManifest) {
    return candidate;
  }

  try {
    if (candidate.protocol === 'hls') {
      const manifest = parseHlsManifest({
        manifestUrl: candidate.manifestUrl,
        content: await fetchManifest(candidate.manifestUrl),
      });
      const variantDurations =
        manifest.playlistKind === 'master'
          ? await fetchDurationsWithLimit(
              manifest.variants
                .map((variant) => variant.url)
                .filter((url): url is string => typeof url === 'string' && url.length > 0),
              async (url) => {
                try {
                  return parseHlsManifest({
                    manifestUrl: url,
                    content: await fetchManifest(url),
                  }).durationSec;
                } catch {
                  return undefined;
                }
              },
            )
          : [];
      const durationSec =
        manifest.durationSec ??
        variantDurations.reduce<number | undefined>(
          (maxDuration, duration) =>
            duration === undefined
              ? maxDuration
              : Math.max(maxDuration ?? 0, duration),
          undefined,
        );
      const hydrated: MediaCandidate = {
        ...candidate,
        durationSec,
        protection: manifest.protection,
        status:
          manifest.protection.kind === 'drm'
            ? 'protected'
            : candidate.status,
        variants: manifest.variants.length > 0 ? manifest.variants : candidate.variants,
        audioTracks: manifest.audioTracks,
        subtitleTracks: manifest.subtitleTracks,
      };

      return { ...hydrated, preview: previewForCandidate(hydrated) };
    }

    if (candidate.protocol === 'dash') {
      const manifest = parseMpd({
        manifestUrl: candidate.manifestUrl,
        content: await fetchManifest(candidate.manifestUrl),
      });
      const hydrated: MediaCandidate = {
        ...candidate,
        protection: manifest.protection,
        status:
          manifest.protection.kind === 'drm'
            ? 'protected'
            : candidate.status,
        variants: manifest.variants.length > 0 ? manifest.variants : candidate.variants,
        audioTracks: manifest.audioTracks,
        subtitleTracks: manifest.subtitleTracks,
      };

      return { ...hydrated, preview: previewForCandidate(hydrated) };
    }
  } catch {
    return candidate;
  }

  return candidate;
}

async function getCandidatesForTab(
  tabId: number,
  dependencies: RuntimeRouterDependencies,
): Promise<MediaCandidate[]> {
  const journalEvidence = dependencies.requestJournal
    ?.get(tabId)
    .filter(isCandidateEvidence);

  if (journalEvidence && journalEvidence.length > 0) {
    const candidates = dependencies.candidateRegistry.setFromEvidence({
      tabId,
      pageUrl: getCandidatePageUrl(tabId, journalEvidence, dependencies),
      pageTitle: getCandidatePageTitle(tabId, dependencies),
      evidence: journalEvidence,
    });
    const hydrated = await Promise.all(
      candidates.map((candidate) =>
        hydrateManifestCandidate(candidate, dependencies.fetchManifest),
      ),
    );

    const existing = dependencies.candidateRegistry.get(tabId);
    const merged = dedupeCandidates([...existing, ...hydrated]);

    dependencies.candidateRegistry.set(tabId, merged);
    recordNewDetections(dependencies, existing, merged);

    return dependencies.candidateRegistry.get(tabId);
  }

  return dependencies.candidateRegistry.get(tabId);
}

async function getCandidatesForAllTabs(
  dependencies: RuntimeRouterDependencies,
): Promise<MediaCandidate[]> {
  const tabIds = new Set<number>(dependencies.candidateRegistry.tabIds());

  for (const tabId of dependencies.requestJournal?.tabIds() ?? []) {
    tabIds.add(tabId);
  }

  await Promise.all(
    Array.from(tabIds).map((tabId) => getCandidatesForTab(tabId, dependencies)),
  );

  return dependencies.candidateRegistry.all();
}

function dedupeCandidates(candidates: MediaCandidate[]): MediaCandidate[] {
  const byId = new Map<string, MediaCandidate>();

  for (const candidate of candidates) {
    byId.set(candidate.id, candidate);
  }

  return Array.from(byId.values());
}

function hostnameForCandidate(candidate: MediaCandidate): string {
  const url =
    candidate.origin ||
    candidate.pageUrl ||
    candidate.sourceUrl ||
    candidate.manifestUrl ||
    '';

  try {
    return new URL(url).hostname;
  } catch {
    return url || 'unknown host';
  }
}

function recordNewDetections(
  dependencies: RuntimeRouterDependencies,
  existing: MediaCandidate[],
  merged: MediaCandidate[],
): void {
  if (!dependencies.recordDetection) {
    return;
  }

  const existingIds = new Set(existing.map((candidate) => candidate.id));
  const countsByHostname = new Map<string, number>();

  for (const candidate of merged) {
    if (existingIds.has(candidate.id)) {
      continue;
    }

    const hostname = hostnameForCandidate(candidate);
    countsByHostname.set(hostname, (countsByHostname.get(hostname) ?? 0) + 1);
  }

  for (const [hostname, count] of countsByHostname) {
    dependencies.recordDetection(hostname, count);
  }
}

function candidateMatchesUrl(candidate: MediaCandidate, url: string): boolean {
  return (
    candidate.sourceUrl === url ||
    candidate.manifestUrl === url ||
    candidate.pageUrl === url
  );
}

// Marks every candidate whose source/manifest/page URL matches the detected DRM
// URL as DRM-protected so the detection actually propagates into the pipeline
// (download/preview gates read `protection.kind === 'drm'` / status 'protected').
// Returns the number of candidates updated across all tabs.
function markCandidatesDrmProtected(
  dependencies: RuntimeRouterDependencies,
  url: string,
  drmName: string,
): number {
  let updatedCount = 0;

  for (const tabId of dependencies.candidateRegistry.tabIds()) {
    const candidates = dependencies.candidateRegistry.get(tabId);
    let changed = false;

    const next = candidates.map((candidate) => {
      if (
        !candidateMatchesUrl(candidate, url) ||
        candidate.protection.kind === 'drm'
      ) {
        return candidate;
      }

      changed = true;
      updatedCount += 1;
      const drmSystems = Array.from(
        new Set([...(candidate.protection.drmSystems ?? []), drmName]),
      );
      const updated: MediaCandidate = {
        ...candidate,
        status: 'protected',
        protection: {
          ...candidate.protection,
          kind: 'drm',
          reason: candidate.protection.reason ?? `DRM detected: ${drmName}`,
          drmSystems,
        },
        updatedAt: Date.now(),
      };

      return { ...updated, preview: previewForCandidate(updated) };
    });

    if (changed) {
      dependencies.candidateRegistry.set(tabId, next);
    }
  }

  return updatedCount;
}

function candidateFromDirectUrl(input: Extract<RuntimeRequest, { type: 'INGEST_DIRECT_URL' }>['payload']): MediaCandidate {
  let origin = input.origin ?? '';
  try {
    origin ||= new URL(input.url).origin;
  } catch {
    origin ||= '';
  }
  const filename = input.filename?.trim();
  const displayName =
    filename ||
    (() => {
      try {
        return new URL(input.url).pathname.split('/').filter(Boolean).pop() || input.url;
      } catch {
        return input.url;
      }
    })();

  return {
    id: `manual-direct:${input.tabId}:${input.url}`,
    tabId: input.tabId,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: input.referer ?? input.url,
    origin,
    displayName,
    sourceUrl: input.url,
    fileExtensionHint: displayName.includes('.') ? displayName.split('.').pop() : undefined,
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [
      {
        source: 'user',
        confidence: 0.95,
        url: input.url,
        initiatorUrl: input.referer,
        notes: ['manual-ingest:direct-url'],
        createdAt: Date.now(),
      },
    ],
    preview: { playable: true, adapter: 'native' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function normalizeHostAccessPattern(origin: string): string {
  try {
    const parsed = new URL(origin);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }

    return `${parsed.origin}/*`;
  } catch {
    return '';
  }
}

async function requestChromeHostAccess(originPattern: string): Promise<boolean> {
  const permissions = chrome.permissions;

  if (!permissions) {
    return false;
  }

  if (permissions.contains) {
    const alreadyGranted = await permissions.contains({ origins: [originPattern] });

    if (alreadyGranted) {
      return true;
    }
  }

  if (!permissions.request) {
    return false;
  }

  return permissions.request({ origins: [originPattern] });
}

async function ingestContentEvidence(
  request: Extract<RuntimeRequest, { type: 'INGEST_CONTENT_EVIDENCE' }>,
  dependencies: RuntimeRouterDependencies,
  senderSnapshot: ActiveTabSnapshot | undefined,
  sender?: chrome.runtime.MessageSender,
): Promise<MediaCandidate[] | undefined> {
  if (!senderSnapshot) {
    return undefined;
  }

  const contentEvidence = request.payload.evidence as CandidateEvidence[];

  if (contentEvidence.length === 0) {
    return dependencies.candidateRegistry.get(senderSnapshot.tabId);
  }

  const existing = dependencies.candidateRegistry.get(senderSnapshot.tabId);
  const candidates = dependencies.candidateRegistry.setFromEvidence({
    tabId: senderSnapshot.tabId,
    frameId: sender?.frameId,
    pageUrl: request.payload.pageUrl || senderSnapshot.url || '',
    pageTitle: request.payload.pageTitle ?? senderSnapshot.title,
    evidence: contentEvidence,
    pageContext: request.payload.pageContext,
  });
  const hydrated = await Promise.all(
    candidates.map((candidate) =>
      hydrateManifestCandidate(candidate, dependencies.fetchManifest),
    ),
  );
  const merged = dedupeCandidates([...existing, ...hydrated]);

  dependencies.candidateRegistry.set(senderSnapshot.tabId, merged);
  recordNewDetections(dependencies, existing, merged);

  return merged;
}

function findCandidateForDownload(
  request: Extract<RuntimeRequest, { type: 'START_DOWNLOAD' }>,
  dependencies: RuntimeRouterDependencies,
  senderSnapshot?: ActiveTabSnapshot,
) {
  if (!senderSnapshot) {
    return dependencies.candidateRegistry.findById(request.payload.candidateId);
  }

  return (
    dependencies.candidateRegistry
    .get(senderSnapshot.tabId)
      .find((candidate) => candidate.id === request.payload.candidateId) ??
    dependencies.candidateRegistry.findById(request.payload.candidateId)
  );
}

function isProtectedCandidateForDownload(
  candidate: ReturnType<typeof findCandidateForDownload>,
): boolean {
  return (
    candidate?.status === 'protected' ||
    candidate?.protection.kind === 'drm' ||
    candidate?.protection.kind === 'unknown'
  );
}

function isProtectedCandidateForAsset(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'sample-aes'
  );
}

function toActiveTabSnapshot(
  sender?: chrome.runtime.MessageSender,
): ActiveTabSnapshot | undefined {
  if (sender?.tab?.id === undefined) {
    return undefined;
  }

  return {
    tabId: sender.tab.id,
    url: sender.tab.url,
    title: sender.tab.title,
    favIconUrl: sender.tab.favIconUrl,
  };
}

function mergeTabSnapshots(
  currentSnapshot: ActiveTabSnapshot | undefined,
  incomingSnapshot: ActiveTabSnapshot,
): ActiveTabSnapshot {
  return {
    ...currentSnapshot,
    tabId: incomingSnapshot.tabId,
    ...(incomingSnapshot.url ? { url: incomingSnapshot.url } : {}),
    ...(incomingSnapshot.title ? { title: incomingSnapshot.title } : {}),
    ...(incomingSnapshot.favIconUrl
      ? { favIconUrl: incomingSnapshot.favIconUrl }
      : {}),
  };
}

export function createRuntimeRouter(
  dependencies: RuntimeRouterDependencies,
): RuntimeRouter {
  return {
    canHandleMessage(request) {
      return handledRequestTypes.has(
        request.type as RoutedRuntimeRequest['type'],
      );
    },

    async handleMessage(request, sender) {
      const senderSnapshot = toActiveTabSnapshot(sender);

      if (senderSnapshot) {
        dependencies.tabSnapshots.set(
          mergeTabSnapshots(
            dependencies.tabSnapshots.get(senderSnapshot.tabId),
            senderSnapshot,
          ),
        );
      }

      switch (request.type) {
        case 'INGEST_CONTENT_EVIDENCE': {
          const candidates = await ingestContentEvidence(
            request,
            dependencies,
            senderSnapshot,
            sender,
          );

          if (!candidates) {
            return createRuntimeErrorResponse(
              'NO_SENDER_TAB',
              'Content evidence must be sent from a tab.',
              request.requestId,
            );
          }

          return createRuntimeResponse(
            'INGEST_CONTENT_EVIDENCE_RESULT',
            { candidates },
            request.requestId,
          );
        }

        case 'INGEST_MANUAL_HLS': {
          const { tabId, pageUrl, pageTitle, input, baseUrl } = request.payload;
          const evidence = createManualHlsIngestEvidence({
            input,
            baseUrl,
            pageUrl,
            pageTitle,
          }) as CandidateEvidence[];
          const existing = dependencies.candidateRegistry.get(tabId);
          const ingested = dependencies.candidateRegistry.setFromEvidence({
            tabId,
            pageUrl,
            pageTitle,
            evidence,
          });
          const hydrated = await Promise.all(
            ingested.map((candidate) =>
              hydrateManifestCandidate(candidate, dependencies.fetchManifest),
            ),
          );
          const merged = dedupeCandidates([...existing, ...hydrated]);

          dependencies.candidateRegistry.set(tabId, merged);
          recordNewDetections(dependencies, existing, merged);

          return createRuntimeResponse(
            'INGEST_MANUAL_HLS_RESULT',
            { candidates: merged },
            request.requestId,
          );
        }

        case 'INGEST_IQIYI_CONFIG': {
          if (!senderSnapshot) {
            return createRuntimeErrorResponse(
              'NO_SENDER_TAB',
              'iQIYI config must be sent from a tab.',
              request.requestId,
            );
          }

          const { pageUrl, title, m3u8Urls } = request.payload;
          const now = Date.now();

          const evidence: CandidateEvidence[] = m3u8Urls.map((url) => ({
            source: 'player-config' as const,
            confidence: 0.68,
            url,
            initiatorUrl: pageUrl,
            notes: [
              'plugin:iqiyi',
              'source:iqiyi-config',
              'protocol:hls',
              `title:${title}`,
              `manifest-url:${url}`,
            ],
            createdAt: now,
          }));

          const existing = dependencies.candidateRegistry.get(senderSnapshot.tabId);
          const ingested = dependencies.candidateRegistry.setFromEvidence({
            tabId: senderSnapshot.tabId,
            pageUrl: pageUrl || senderSnapshot.url || '',
            pageTitle: title ?? senderSnapshot.title,
            evidence,
          });
          const hydrated = await Promise.all(
            ingested.map((candidate) =>
              hydrateManifestCandidate(candidate, dependencies.fetchManifest),
            ),
          );
          const merged = dedupeCandidates([...existing, ...hydrated]);

          dependencies.candidateRegistry.set(senderSnapshot.tabId, merged);
          recordNewDetections(dependencies, existing, merged);

          return createRuntimeResponse(
            'INGEST_IQIYI_CONFIG_RESULT',
            { candidates: merged },
            request.requestId,
          );
        }

        case 'DRM_DETECTED': {
          const { drmName, trigger, url } = request.payload;

          // No sink for the detection means nothing is recorded. Returning
          // ok:true here would be a false success, so report honestly.
          if (!dependencies.drmDetections) {
            return createRuntimeResponse(
              'DRM_DETECTED_RESULT',
              { ok: false },
              request.requestId,
            );
          }

          const existing = dependencies.drmDetections.get(url) ?? [];
          const alreadyRecorded = existing.some(
            (record) => record.drmName === drmName,
          );

          if (!alreadyRecorded) {
            dependencies.drmDetections.set(url, [
              ...existing,
              { drmName, trigger, url, detectedAt: Date.now() },
            ]);
          }

          markCandidatesDrmProtected(dependencies, url, drmName);

          return createRuntimeResponse(
            'DRM_DETECTED_RESULT',
            { ok: true },
            request.requestId,
          );
        }

        case 'GET_CANDIDATES': {
          const candidates = await getCandidatesForTab(
            request.payload.tabId,
            dependencies,
          );

          return createRuntimeResponse(
            'GET_CANDIDATES_RESULT',
            { candidates },
            request.requestId,
          );
        }

        case 'GET_ALL_CANDIDATES': {
          const candidates = await getCandidatesForAllTabs(dependencies);

          return createRuntimeResponse(
            'GET_ALL_CANDIDATES_RESULT',
            { candidates },
            request.requestId,
          );
        }

        case 'CLEAN_EXTENSION_STORAGE': {
          const result = dependencies.cleanupExtensionStorage
            ? await dependencies.cleanupExtensionStorage()
            : {
                orphanedFragmentBuckets: 0,
                activeJobBuckets: 0,
                removedStorageKeys: [],
              };

          return createRuntimeResponse(
            'CLEAN_EXTENSION_STORAGE_RESULT',
            result,
            request.requestId,
          );
        }

        case 'GET_QUEUE_STATS': {
          const stats = dependencies.getQueueStats
            ? await dependencies.getQueueStats()
            : dependencies.downloadQueue
            ? dependencies.downloadQueue.stats()
            : buildDefaultQueueStats();

          return createRuntimeResponse(
            'GET_QUEUE_STATS_RESULT',
            { stats },
            request.requestId,
          );
        }

        case 'REQUEST_HOST_ACCESS': {
          const originPattern = normalizeHostAccessPattern(request.payload.origin);

          if (!originPattern) {
            return createRuntimeErrorResponse(
              'INVALID_ORIGIN',
              `Unsupported host access origin: ${request.payload.origin}`,
              request.requestId,
            );
          }

          const granted = await (
            dependencies.requestHostAccess ?? requestChromeHostAccess
          )(originPattern);

          return createRuntimeResponse(
            'REQUEST_HOST_ACCESS_RESULT',
            { granted, origin: request.payload.origin },
            request.requestId,
          );
        }

        case 'GET_PREVIEW_ASSET': {
          const candidate = dependencies.candidateRegistry.findById(
            request.payload.candidateId,
          );

          if (!candidate) {
            return createRuntimeErrorResponse(
              'NOT_FOUND',
              `Candidate not found: ${request.payload.candidateId}`,
              request.requestId,
            );
          }

          if (isProtectedCandidateForAsset(candidate)) {
            return createRuntimeErrorResponse(
              'PROTECTED_MEDIA',
              'Protected media cannot generate preview assets.',
              request.requestId,
            );
          }

          if (!dependencies.ensurePreviewClip) {
            return createRuntimeErrorResponse(
              'NATIVE_UNAVAILABLE',
              'Native preview service is not configured.',
              request.requestId,
            );
          }

          let asset: GeneratedAssetResult;

          try {
            asset = await dependencies.ensurePreviewClip(candidate, {
              format: request.payload.format,
            });
          } catch (error) {
            return createRuntimeErrorResponse(
              'PREVIEW_ASSET_FAILED',
              error instanceof Error ? error.message : 'Preview asset generation failed.',
              request.requestId,
            );
          }

          return createRuntimeResponse(
            'GET_PREVIEW_ASSET_RESULT',
            asset,
            request.requestId,
          );
        }

        case 'GET_THUMBNAIL_ASSET': {
          const candidate = dependencies.candidateRegistry.findById(
            request.payload.candidateId,
          );

          if (!candidate) {
            return createRuntimeErrorResponse(
              'NOT_FOUND',
              `Candidate not found: ${request.payload.candidateId}`,
              request.requestId,
            );
          }

          if (isProtectedCandidateForAsset(candidate)) {
            return createRuntimeErrorResponse(
              'PROTECTED_MEDIA',
              'Protected media cannot generate preview assets.',
              request.requestId,
            );
          }

          if (!dependencies.ensureThumbnail) {
            return createRuntimeErrorResponse(
              'NATIVE_UNAVAILABLE',
              'Native thumbnail service is not configured.',
              request.requestId,
            );
          }

          try {
            return createRuntimeResponse(
              'GET_THUMBNAIL_ASSET_RESULT',
              await dependencies.ensureThumbnail(candidate),
              request.requestId,
            );
          } catch (error) {
            return createRuntimeErrorResponse(
              'THUMBNAIL_ASSET_FAILED',
              error instanceof Error ? error.message : 'Thumbnail generation failed.',
              request.requestId,
            );
          }
        }

        case 'GET_MEDIA_ASSET_STATE': {
          if (!dependencies.mediaAssetService) {
            return createRuntimeResponse(
              'GET_MEDIA_ASSET_STATE_RESULT',
              { states: [] },
              request.requestId,
            );
          }

          return createRuntimeResponse(
            'GET_MEDIA_ASSET_STATE_RESULT',
            { states: await dependencies.mediaAssetService.getState(request.payload.candidateId) },
            request.requestId,
          );
        }

        case 'QUEUE_MEDIA_ASSET': {
          const candidate = dependencies.candidateRegistry.findById(
            request.payload.candidateId,
          );

          if (!candidate) {
            return createRuntimeErrorResponse(
              'NOT_FOUND',
              `Candidate not found: ${request.payload.candidateId}`,
              request.requestId,
            );
          }

          if (!dependencies.mediaAssetService) {
            return createRuntimeErrorResponse(
              'NOT_CONFIGURED',
              'Media asset service is not configured.',
              request.requestId,
            );
          }

          const state = await dependencies.mediaAssetService.queueAsset(candidate, request.payload.kind, {
            priority: request.payload.priority,
          });

          return createRuntimeResponse(
            'QUEUE_MEDIA_ASSET_RESULT',
            { state },
            request.requestId,
          );
        }

        case 'DEBUG_GET_EVIDENCE': {
          const candidate = dependencies.candidateRegistry.findById(
            request.payload.candidateId,
          );

          if (!candidate) {
            return createRuntimeErrorResponse(
              'NOT_FOUND',
              `Candidate not found: ${request.payload.candidateId}`,
              request.requestId,
            );
          }

          return createRuntimeResponse(
            'DEBUG_GET_EVIDENCE_RESULT',
            { evidence: candidate.evidence },
            request.requestId,
          );
        }

        case 'START_DOWNLOAD': {
          if (!dependencies.jobStore || !dependencies.historyStore) {
            return createRuntimeErrorResponse(
              'NOT_CONFIGURED',
              'Direct download services are not configured.',
              request.requestId,
            );
          }

          const candidate = findCandidateForDownload(
            request,
            dependencies,
            senderSnapshot,
          );

          if (!candidate) {
            return createRuntimeErrorResponse(
              'NOT_FOUND',
              `Candidate not found: ${request.payload.candidateId}`,
              request.requestId,
            );
          }

          if (isProtectedCandidateForDownload(candidate)) {
            return createRuntimeErrorResponse(
              'PROTECTED_MEDIA',
              'Protected media cannot be started through the generic download flow.',
              request.requestId,
            );
          }

          try {
            const intent = buildDownloadIntent(candidate, {
              action: request.payload.selection.action,
              selection: request.payload.selection,
            });

            if (!intent.shouldQueue) {
              return createRuntimeErrorResponse(
                'COPY_ONLY',
                'Copy actions do not enter the download queue.',
                request.requestId,
                { url: intent.copyUrl },
              );
            }

            if (dependencies.downloadQueue) {
              const job = dependencies.downloadQueue.enqueue(
                candidate,
                intent.selection,
              );
              void dependencies.downloadQueue.drain();

              return createRuntimeResponse(
                'START_DOWNLOAD_RESULT',
                { job },
                request.requestId,
              );
            }

            const job: DownloadJob = await startDirectDownload(candidate, {
              jobStore: dependencies.jobStore,
              historyStore: dependencies.historyStore,
              selection: intent.selection,
              downloadFile: dependencies.downloadFile,
            });

            return createRuntimeResponse(
              'START_DOWNLOAD_RESULT',
              { job },
              request.requestId,
            );
          } catch (error) {
            return createRuntimeErrorResponse(
              'DIRECT_DOWNLOAD_FAILED',
              error instanceof Error ? error.message : 'Direct download failed',
              request.requestId,
            );
          }
        }

        case 'CANCEL_DOWNLOAD': {
          const result = dependencies.cancelDownload
            ? await dependencies.cancelDownload(request.payload.jobId)
            : { cancelled: Boolean(dependencies.downloadQueue?.cancel(request.payload.jobId)) };
          if (result.cancelled) {
            await dependencies.cleanupJobStorage?.(request.payload.jobId);
          }

          return createRuntimeResponse(
            'CANCEL_DOWNLOAD_RESULT',
            result,
            request.requestId,
          );
        }

        case 'GET_JOB': {
          return createRuntimeResponse(
            'GET_JOB_RESULT',
            { job: dependencies.jobStore?.get(request.payload.jobId) },
            request.requestId,
          );
        }

        case 'GET_JOBS': {
          return createRuntimeResponse(
            'GET_JOBS_RESULT',
            { jobs: dependencies.jobStore?.list() ?? [] },
            request.requestId,
          );
        }

        case 'RETRY_DOWNLOAD': {
          const queued = dependencies.downloadQueue?.retry(request.payload.jobId) ?? false;
          void dependencies.downloadQueue?.drain();

          return createRuntimeResponse(
            'RETRY_DOWNLOAD_RESULT',
            { job: dependencies.jobStore?.get(request.payload.jobId), queued },
            request.requestId,
          );
        }

        case 'RESAVE_DOWNLOAD': {
          const job = dependencies.jobStore?.get(request.payload.jobId);
          const candidate = job
            ? dependencies.candidateRegistry.findById(job.candidateId)
            : undefined;

          if (!job || !candidate || !dependencies.downloadQueue) {
            return createRuntimeErrorResponse(
              'NOT_FOUND',
              `Job not found or cannot be re-saved: ${request.payload.jobId}`,
              request.requestId,
            );
          }

          const nextJob = dependencies.downloadQueue.enqueue(candidate, job.selection);
          void dependencies.downloadQueue.drain();

          return createRuntimeResponse(
            'RESAVE_DOWNLOAD_RESULT',
            { job: nextJob, queued: true },
            request.requestId,
          );
        }

        case 'REMOVE_DOWNLOAD': {
          const removed = Boolean(dependencies.jobStore?.delete(request.payload.jobId));
          if (removed) {
            await dependencies.cleanupJobStorage?.(request.payload.jobId);
          }

          return createRuntimeResponse(
            'REMOVE_DOWNLOAD_RESULT',
            { removed },
            request.requestId,
          );
        }

        case 'CLEAR_COMPLETED_DOWNLOADS': {
          const removedIds = dependencies.downloadQueue?.clearCompleted() ?? [];

          return createRuntimeResponse(
            'CLEAR_COMPLETED_DOWNLOADS_RESULT',
            { removedIds },
            request.requestId,
          );
        }

        case 'PAUSE_ALL_DOWNLOADS': {
          const pausedIds: string[] = [];
          for (const job of dependencies.jobStore?.list() ?? []) {
            if (!PAUSEABLE_PHASES.includes(job.phase)) {
              continue;
            }

            // Delegate to the queue's real pause: it aborts the in-flight run,
            // sets phase 'paused', and clears the active set, leaving the job
            // resumable. Direct jobStore phase writes left downloads running.
            if (dependencies.downloadQueue?.pause(job.id)) {
              pausedIds.push(job.id);
            }
          }

          return createRuntimeResponse(
            'PAUSE_ALL_DOWNLOADS_RESULT',
            { pausedIds },
            request.requestId,
          );
        }

        case 'RESUME_ALL_DOWNLOADS': {
          const resumedIds: string[] = [];
          for (const job of dependencies.jobStore?.list() ?? []) {
            if (job.phase !== 'paused') {
              continue;
            }

            if (dependencies.downloadQueue?.resume(job.id)) {
              resumedIds.push(job.id);
            }
          }
          void dependencies.downloadQueue?.drain();

          return createMessageEnvelope(
            'RESUME_ALL_DOWNLOADS_RESULT',
            { resumedIds },
            request.requestId,
          ) satisfies ResumeAllDownloadsResult;
        }

        case 'INGEST_DIRECT_URL': {
          if (!dependencies.jobStore || !dependencies.historyStore) {
            return createRuntimeErrorResponse(
              'NOT_CONFIGURED',
              'Direct download services are not configured.',
              request.requestId,
            );
          }

          const candidate = candidateFromDirectUrl(request.payload);
          const existing = dependencies.candidateRegistry.get(candidate.tabId);
          const merged = dedupeCandidates([...existing, candidate]);
          dependencies.candidateRegistry.set(candidate.tabId, merged);
          recordNewDetections(dependencies, existing, merged);
          const job = dependencies.downloadQueue
            ? dependencies.downloadQueue.enqueue(candidate, { mode: 'best' })
            : undefined;
          void dependencies.downloadQueue?.drain();

          return createRuntimeResponse(
            'INGEST_DIRECT_URL_RESULT',
            { candidate, job },
            request.requestId,
          );
        }

        case 'RETRY_HLS_SEGMENT': {
          const job = dependencies.jobStore?.get(request.payload.jobId);

          if (!job || !dependencies.jobStore) {
            return createRuntimeErrorResponse(
              'NOT_FOUND',
              `Job not found: ${request.payload.jobId}`,
              request.requestId,
            );
          }

          const updated = dependencies.jobStore.update(job.id, {
            phase: 'queued',
            failure: undefined,
            progressPct: 0,
            segmentStatuses: (job.segmentStatuses ?? []).map((segment) =>
              segment.index === request.payload.segmentIndex
                ? { ...segment, status: 'pending' as const, error: undefined }
                : segment,
            ),
          });
          const queued = true;
          void dependencies.downloadQueue?.drain();

          return createRuntimeResponse(
            'RETRY_HLS_SEGMENT_RESULT',
            { job: updated, queued },
            request.requestId,
          );
        }

        case 'RETRY_FAILED_HLS_SEGMENTS': {
          const job = dependencies.jobStore?.get(request.payload.jobId);

          if (!job || !dependencies.jobStore) {
            return createRuntimeErrorResponse(
              'NOT_FOUND',
              `Job not found: ${request.payload.jobId}`,
              request.requestId,
            );
          }

          const updated = dependencies.jobStore.update(job.id, {
            phase: 'queued',
            failure: undefined,
            progressPct: 0,
            segmentStatuses: (job.segmentStatuses ?? []).map((segment) =>
              segment.status === 'failed'
                ? { ...segment, status: 'pending' as const, error: undefined }
                : segment,
            ),
          });
          const queued = dependencies.downloadQueue?.retry(job.id) ?? true;
          void dependencies.downloadQueue?.drain();

          return createRuntimeResponse(
            'RETRY_FAILED_HLS_SEGMENTS_RESULT',
            { job: updated, queued },
            request.requestId,
          );
        }

        case 'UPDATE_HLS_SEGMENT_RANGE': {
          const job = dependencies.jobStore?.get(request.payload.jobId);

          if (!job || !dependencies.jobStore) {
            return createRuntimeErrorResponse(
              'NOT_FOUND',
              `Job not found: ${request.payload.jobId}`,
              request.requestId,
            );
          }

          const updated = dependencies.jobStore.update(job.id, {
            selectedSegmentRange: request.payload.range,
            selection: {
              ...job.selection,
              segmentRange: request.payload.range,
              hlsTimelinePolicy: 'selected-range',
            },
            hlsTimelinePolicy: 'selected-range',
          });

          return createRuntimeResponse(
            'UPDATE_HLS_SEGMENT_RANGE_RESULT',
            { job: updated },
            request.requestId,
          );
        }

        case 'EXPORT_PARTIAL_HLS': {
          const job = dependencies.jobStore?.get(request.payload.jobId);

          if (!job || !dependencies.jobStore) {
            return createRuntimeErrorResponse(
              'NOT_FOUND',
              `Job not found: ${request.payload.jobId}`,
              request.requestId,
            );
          }

          const updated = dependencies.jobStore.update(job.id, {
            phase: 'queued',
            failure: undefined,
            progressPct: 0,
            selectedSegmentRange: request.payload.range,
            selection: {
              ...job.selection,
              segmentRange: request.payload.range,
              hlsTimelinePolicy: 'selected-range',
            },
            hlsTimelinePolicy: 'selected-range',
            segmentStatuses: (job.segmentStatuses ?? []).map((segment) => ({
              ...segment,
              status:
                segment.index >= request.payload.range.start &&
                segment.index <= request.payload.range.end
                  ? 'pending'
                  : 'skipped',
            })),
          });
          const queued = dependencies.downloadQueue?.retry(job.id) ?? true;
          void dependencies.downloadQueue?.drain();

          return createRuntimeResponse(
            'EXPORT_PARTIAL_HLS_RESULT',
            { job: updated, queued },
            request.requestId,
          );
        }

        case 'RECOVER_HLS_EXPORT': {
          const job = dependencies.jobStore?.get(request.payload.jobId);

          if (!job || !dependencies.jobStore) {
            return createRuntimeErrorResponse(
              'NOT_FOUND',
              `Job not found: ${request.payload.jobId}`,
              request.requestId,
            );
          }

          const outputKind =
            request.payload.action === 'save_raw_ts' ? 'original' : 'mp4';
          const updated = dependencies.jobStore.update(job.id, {
            phase: 'queued',
            failure: undefined,
            progressPct: 0,
            output: undefined,
            selection: {
              ...job.selection,
              outputKind,
            },
          });
          const queued = dependencies.downloadQueue?.retry(job.id) ?? true;
          void dependencies.downloadQueue?.drain();

          return createRuntimeResponse(
            'RECOVER_HLS_EXPORT_RESULT',
            { job: updated, queued },
            request.requestId,
          );
        }

        case 'REPLACE_HLS_MANIFEST_URL': {
          const job = dependencies.jobStore?.get(request.payload.jobId);
          const candidate = job
            ? dependencies.candidateRegistry.findById(job.candidateId)
            : undefined;

          if (!job || !candidate || !dependencies.downloadQueue) {
            return createRuntimeErrorResponse(
              'NOT_FOUND',
              `Job not found or cannot replace manifest URL: ${request.payload.jobId}`,
              request.requestId,
            );
          }

          const updatedCandidate: MediaCandidate = {
            ...candidate,
            manifestUrl: request.payload.manifestUrl,
            sourceUrl:
              candidate.protocol === 'hls' || candidate.protocol === 'dash'
                ? undefined
                : candidate.sourceUrl,
            evidence: [
              ...candidate.evidence,
              {
                source: 'user',
                confidence: 0.9,
                url: request.payload.manifestUrl,
                initiatorUrl: candidate.pageUrl,
                notes: ['recovery:manifest-url-replacement'],
                createdAt: Date.now(),
              },
            ],
            updatedAt: Date.now(),
          };
          dependencies.candidateRegistry.set(updatedCandidate.tabId, [
            ...dependencies.candidateRegistry
              .get(updatedCandidate.tabId)
              .filter((entry) => entry.id !== updatedCandidate.id),
            updatedCandidate,
          ]);
          const nextJob = dependencies.downloadQueue.enqueue(updatedCandidate, {
            ...job.selection,
          });
          void dependencies.downloadQueue.drain();

          return createRuntimeResponse(
            'REPLACE_HLS_MANIFEST_URL_RESULT',
            { job: nextJob, queued: true },
            request.requestId,
          );
        }

        default:
          return createRuntimeErrorResponse(
            'UNKNOWN',
            `Unhandled runtime request: ${request.type}`,
            request.requestId,
          );
      }
    },
  };
}

export function registerRuntimeRouter(
  runtimeRouter: RuntimeRouter,
  runtime: RuntimeMessageHost = chrome.runtime,
  ready: Promise<void> = Promise.resolve(),
): void {
  runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!runtimeRouter.canHandleMessage(message as RuntimeRouterRequest)) {
      return undefined;
    }

    void ready
      .then(() => runtimeRouter.handleMessage(message as RuntimeRouterRequest, sender))
      .then(sendResponse)
      .catch((error) => {
        const detail = error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error;

        sendResponse(
          createRuntimeErrorResponse(
            'INTERNAL_ERROR',
            error instanceof Error ? error.message : 'Runtime request failed.',
            (message as RuntimeRouterRequest).requestId,
            detail,
          ),
        );
      });

    return true;
  });
}
