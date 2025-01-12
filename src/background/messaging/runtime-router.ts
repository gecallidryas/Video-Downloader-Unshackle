import type {
  ActiveTabSnapshot,
  DownloadJob,
  MediaCandidate,
  QueueStats,
  RuntimeRequest,
  RuntimeResponse,
} from '@/video_downloader_types_skeleton';
import {
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
import type { CandidateEvidence } from '@/src/core/candidates/classify-candidate';

export interface RuntimeRouterDependencies {
  candidateRegistry: CandidateRegistry;
  tabSnapshots: TabSnapshotStore;
  jobStore?: JobStore;
  historyStore?: HistoryStore;
  downloadQueue?: DownloadQueue;
  downloadFile?: DirectDownloadFile;
  requestJournal?: RequestJournal;
  fetchManifest?: (url: string) => Promise<string>;
  getQueueStats?: () => QueueStats | Promise<QueueStats>;
  requestHostAccess?: (originPattern: string) => Promise<boolean>;
}

export interface RuntimeRouter {
  canHandleMessage(request: RuntimeRequest): boolean;
  handleMessage(
    request: RuntimeRequest,
    sender?: chrome.runtime.MessageSender,
  ): Promise<RuntimeResponse>;
}

export interface RuntimeMessageHost {
  onMessage: {
    addListener(
      callback: (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: RuntimeResponse) => void,
      ) => boolean | void,
    ): void;
  };
}

type RoutedRuntimeRequest = Extract<
  RuntimeRequest,
  {
    type:
      | 'INGEST_CONTENT_EVIDENCE'
      | 'GET_CANDIDATES'
      | 'GET_QUEUE_STATS'
      | 'REQUEST_HOST_ACCESS'
      | 'DEBUG_GET_EVIDENCE'
      | 'START_DOWNLOAD';
  }
>;

const handledRequestTypes = new Set<RoutedRuntimeRequest['type']>([
  'INGEST_CONTENT_EVIDENCE',
  'GET_CANDIDATES',
  'GET_QUEUE_STATS',
  'REQUEST_HOST_ACCESS',
  'DEBUG_GET_EVIDENCE',
  'START_DOWNLOAD',
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
    candidate.protection.kind === 'unknown' ||
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
      const hydrated: MediaCandidate = {
        ...candidate,
        protection: manifest.protection,
        status:
          manifest.protection.kind === 'drm' || manifest.protection.kind === 'unknown'
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
          manifest.protection.kind === 'drm' || manifest.protection.kind === 'unknown'
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

    dependencies.candidateRegistry.set(
      tabId,
      dedupeCandidates([...dependencies.candidateRegistry.get(tabId), ...hydrated]),
    );

    return dependencies.candidateRegistry.get(tabId);
  }

  return dependencies.candidateRegistry.get(tabId);
}

function dedupeCandidates(candidates: MediaCandidate[]): MediaCandidate[] {
  const byId = new Map<string, MediaCandidate>();

  for (const candidate of candidates) {
    byId.set(candidate.id, candidate);
  }

  return Array.from(byId.values());
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
    pageContext: request.payload.pageContext as never,
  });
  const hydrated = await Promise.all(
    candidates.map((candidate) =>
      hydrateManifestCandidate(candidate, dependencies.fetchManifest),
    ),
  );
  const merged = dedupeCandidates([...existing, ...hydrated]);

  dependencies.candidateRegistry.set(senderSnapshot.tabId, merged);

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
): void {
  runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!runtimeRouter.canHandleMessage(message as RuntimeRequest)) {
      return undefined;
    }

    void runtimeRouter
      .handleMessage(message as RuntimeRequest, sender)
      .then(sendResponse);

    return true;
  });
}
