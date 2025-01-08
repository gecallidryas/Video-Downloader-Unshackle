import type {
  ActiveTabSnapshot,
  DownloadJob,
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
import {
  startDirectDownload,
  type DirectDownloadFile,
} from '@/src/core/direct/start-direct-download';

export interface RuntimeRouterDependencies {
  candidateRegistry: CandidateRegistry;
  tabSnapshots: TabSnapshotStore;
  jobStore?: JobStore;
  historyStore?: HistoryStore;
  downloadFile?: DirectDownloadFile;
  getQueueStats?: () => QueueStats | Promise<QueueStats>;
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
  { type: 'GET_CANDIDATES' | 'GET_QUEUE_STATS' | 'START_DOWNLOAD' }
>;

const handledRequestTypes = new Set<RoutedRuntimeRequest['type']>([
  'GET_CANDIDATES',
  'GET_QUEUE_STATS',
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

function findCandidateForDownload(
  request: Extract<RuntimeRequest, { type: 'START_DOWNLOAD' }>,
  dependencies: RuntimeRouterDependencies,
  senderSnapshot?: ActiveTabSnapshot,
) {
  if (!senderSnapshot) {
    return undefined;
  }

  return dependencies.candidateRegistry
    .get(senderSnapshot.tabId)
    .find((candidate) => candidate.id === request.payload.candidateId);
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
        case 'GET_CANDIDATES': {
          const snapshot = dependencies.tabSnapshots.getCandidateSnapshot(
            request.payload.tabId,
            dependencies.candidateRegistry,
          );

          return createRuntimeResponse(
            'GET_CANDIDATES_RESULT',
            { candidates: snapshot.candidates },
            request.requestId,
          );
        }

        case 'GET_QUEUE_STATS': {
          const stats = dependencies.getQueueStats
            ? await dependencies.getQueueStats()
            : buildDefaultQueueStats();

          return createRuntimeResponse(
            'GET_QUEUE_STATS_RESULT',
            { stats },
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
            const job: DownloadJob = await startDirectDownload(candidate, {
              jobStore: dependencies.jobStore,
              historyStore: dependencies.historyStore,
              selection: request.payload.selection,
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
