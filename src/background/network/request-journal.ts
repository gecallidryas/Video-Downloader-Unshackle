import type { DetectionEvidence } from '@/video_downloader_types_skeleton';
import {
  classifyRequest,
  type RequestClassification,
  type RequestHeaderLike,
  type RequestLike,
} from './classify-request';
import type { HeaderContextStore } from './header-context';

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

export interface RequestJournalOptions {
  duplicateWindowMs?: number;
  now?: () => number;
}

export interface WebRequestEventLike {
  addListener(
    callback: (details: chrome.webRequest.WebRequestDetails) => void,
    filter: chrome.webRequest.RequestFilter,
    extraInfoSpec?: string[],
  ): void;
}

export interface WebRequestHostLike {
  onBeforeSendHeaders?: WebRequestEventLike;
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

export function createRequestJournal(
  maxEntriesPerTab = 200,
  options: RequestJournalOptions = {},
): RequestJournal {
  const evidenceByTabId = new Map<number, NetworkRequestEvidence[]>();
  const recentRequests = new Map<string, number>();
  const duplicateWindowMs = options.duplicateWindowMs ?? 2_000;

  function getEvidenceTime(evidence: NetworkRequestEvidence): number {
    return evidence.detectedAt ?? options.now?.() ?? Date.now();
  }

  function isDuplicate(tabId: number, evidence: NetworkRequestEvidence): boolean {
    const key = `${tabId}|${evidence.url}`;
    const now = getEvidenceTime(evidence);
    const previous = recentRequests.get(key);

    recentRequests.set(key, now);

    if (previous === undefined) {
      return false;
    }

    return now - previous < duplicateWindowMs;
  }

  return {
    add(tabId, evidence) {
      if (isDuplicate(tabId, evidence)) {
        return cloneNetworkEvidence(evidence);
      }

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
  headerContext?: HeaderContextStore,
): void {
  webRequest?.onBeforeSendHeaders?.addListener(
    (details) => {
      const requestHeaders = (details as { requestHeaders?: RequestHeaderLike[] })
        .requestHeaders;

      if (details.tabId < 0 || !requestHeaders) {
        return;
      }

      headerContext?.capture({
        requestId: details.requestId,
        url: details.url,
        requestHeaders,
      });
    },
    { urls: ['<all_urls>'] },
    ['requestHeaders'],
  );

  webRequest?.onCompleted?.addListener(
    (details) => {
      const responseHeaders = (details as { responseHeaders?: RequestHeaderLike[] })
        .responseHeaders;

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
        responseHeaders,
      });
      headerContext?.deleteRequest(details.requestId);
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders'],
  );
}
