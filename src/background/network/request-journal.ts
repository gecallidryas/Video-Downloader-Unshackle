import type { DetectionEvidence } from '@/video_downloader_types_skeleton';
import {
  classifyRequest,
  type RequestClassification,
  type RequestLike,
} from './classify-request';

export interface NetworkRequestEvidence extends RequestClassification {
  tabId: number;
  frameId?: number;
  requestId?: string;
  method?: string;
  detectedAt: number;
}

export interface RequestJournal {
  add(tabId: number, evidence: NetworkRequestEvidence): NetworkRequestEvidence;
  addRequest(tabId: number, request: RequestLike): NetworkRequestEvidence;
  get(tabId: number): NetworkRequestEvidence[];
  clear(tabId: number): void;
}

export interface WebRequestEventLike {
  addListener(
    callback: (details: chrome.webRequest.OnCompletedDetails) => void,
    filter: chrome.webRequest.RequestFilter,
    extraInfoSpec?: `${chrome.webRequest.OnCompletedOptions}`[],
  ): void;
}

export interface WebRequestHostLike {
  onCompleted?: WebRequestEventLike;
}

function cloneEvidence(evidence: DetectionEvidence): DetectionEvidence {
  return {
    ...evidence,
    notes: evidence.notes ? [...evidence.notes] : undefined,
  };
}

function cloneNetworkEvidence(
  evidence: NetworkRequestEvidence,
): NetworkRequestEvidence {
  return {
    ...evidence,
    evidence: cloneEvidence(evidence.evidence),
  };
}

function buildNetworkEvidence(
  tabId: number,
  request: RequestLike,
): NetworkRequestEvidence {
  const classification = classifyRequest(request);
  const detectedAt = classification.evidence.createdAt;

  return {
    ...classification,
    tabId,
    frameId: request.frameId,
    requestId: request.requestId,
    method: request.method,
    detectedAt,
  };
}

export function createRequestJournal(maxEntriesPerTab = 200): RequestJournal {
  const evidenceByTabId = new Map<number, NetworkRequestEvidence[]>();

  return {
    add(tabId, evidence) {
      const entries = evidenceByTabId.get(tabId) ?? [];
      const nextEntries = [...entries, cloneNetworkEvidence(evidence)].slice(
        -maxEntriesPerTab,
      );

      evidenceByTabId.set(tabId, nextEntries);

      return cloneNetworkEvidence(evidence);
    },

    addRequest(tabId, request) {
      return this.add(tabId, buildNetworkEvidence(tabId, request));
    },

    get(tabId) {
      return (evidenceByTabId.get(tabId) ?? []).map(cloneNetworkEvidence);
    },

    clear(tabId) {
      evidenceByTabId.delete(tabId);
    },
  };
}

function getDefaultWebRequestHost(): WebRequestHostLike | undefined {
  if (typeof chrome === 'undefined') {
    return undefined;
  }

  return chrome.webRequest;
}

export function registerPassiveRequestJournal(
  journal: RequestJournal,
  webRequest: WebRequestHostLike | undefined = getDefaultWebRequestHost(),
): void {
  const responseHeadersOption: `${chrome.webRequest.OnCompletedOptions}` =
    'responseHeaders';

  webRequest?.onCompleted?.addListener(
    (details) => {
      if (details.tabId < 0) {
        return;
      }

      journal.addRequest(details.tabId, {
        url: details.url,
        initiator: details.initiator,
        frameId: details.frameId,
        requestId: details.requestId,
        method: details.method,
        type: details.type,
        timeStamp: details.timeStamp,
        responseHeaders: details.responseHeaders,
      });
    },
    { urls: ['<all_urls>'] },
    [responseHeadersOption],
  );
}
