import type { DetectionEvidence } from '@/video_downloader_types_skeleton';
import {
  createRegexClassifier,
  type RegexClassifier,
} from '@/src/core/capture-rules/regex-classifier';
import {
  createCaptureRuleEngine,
  type CaptureRuleEngine,
  type CaptureRuleEngineOptions,
} from '@/src/core/capture-rules/capture-rule-engine';
import {
  classifyRequest,
  type RequestCategory,
  type RequestClassification,
  type RequestHeaderLike,
  type RequestLike,
} from './classify-request';
import type { HeaderContextStore } from './header-context';
import {
  createDebouncedWriter,
  type StatePersistence,
} from '@/src/background/state/state-persistence';

export interface NetworkRequestEvidence extends RequestClassification {
  tabId: number;
  frameId?: number;
  requestId?: string;
  method?: string;
  detectedAt: number;
}

export interface RequestJournal {
  add(tabId: number, evidence: NetworkRequestEvidence): NetworkRequestEvidence;
  addRequest(tabId: number, request: RequestLike): NetworkRequestEvidence | undefined;
  get(tabId: number): NetworkRequestEvidence[];
  tabIds(): number[];
  clear(tabId: number): void;
  updateCaptureRules(options: CaptureRuleEngineOptions): void;
  rehydrate(): Promise<void>;
  flush(): Promise<void>;
}

export interface RequestJournalOptions {
  duplicateWindowMs?: number;
  now?: () => number;
  captureRules?: CaptureRuleEngineOptions;
  persistence?: StatePersistence;
  persistKey?: string;
  debounceMs?: number;
}

type JournalSnapshot = Array<[number, NetworkRequestEvidence[]]>;

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

type RegexClassificationOverride = Pick<
  RequestClassification,
  'category' | 'protocol' | 'mediaKind'
>;

const regexOverridesByCategory: Partial<
  Record<RequestCategory, RegexClassificationOverride>
> = {
  direct_media: { category: 'direct_media', protocol: 'direct', mediaKind: 'video' },
  hls_manifest: { category: 'hls_manifest', protocol: 'hls', mediaKind: 'video' },
  dash_manifest: { category: 'dash_manifest', protocol: 'dash', mediaKind: 'video' },
  hds_manifest: { category: 'hds_manifest', protocol: 'hds', mediaKind: 'video' },
  mss_manifest: { category: 'mss_manifest', protocol: 'mss', mediaKind: 'video' },
  subtitle: { category: 'subtitle', protocol: 'direct', mediaKind: 'subtitle' },
  subtitle_vtt: { category: 'subtitle_vtt', protocol: 'direct', mediaKind: 'subtitle' },
  subtitle_srt: { category: 'subtitle_srt', protocol: 'direct', mediaKind: 'subtitle' },
  subtitle_ttml: { category: 'subtitle_ttml', protocol: 'direct', mediaKind: 'subtitle' },
  subtitle_dfxp: { category: 'subtitle_dfxp', protocol: 'direct', mediaKind: 'subtitle' },
};

function applyRegexClassification(
  request: RequestLike,
  classification: RequestClassification,
  regexClassifier: RegexClassifier | undefined,
): RequestClassification {
  const category = regexClassifier?.classify(request.url);
  const override = category
    ? regexOverridesByCategory[category as RequestCategory]
    : undefined;

  if (!category || !override) {
    return classification;
  }

  return {
    ...classification,
    ...override,
    evidence: {
      ...classification.evidence,
      confidence: Math.max(classification.evidence.confidence, 0.75),
      notes: [
        ...(classification.evidence.notes ?? []).filter(
          (note) => !note.startsWith('category:'),
        ),
        `category:${override.category}`,
        `regex-category:${category}`,
      ],
    },
  };
}

function createOptionalRegexClassifier(
  options: CaptureRuleEngineOptions | undefined,
): RegexClassifier | undefined {
  try {
    const rules = options?.regexRules ?? [];
    return rules.length > 0 ? createRegexClassifier(rules) : undefined;
  } catch {
    return undefined;
  }
}

function createOptionalCaptureRuleEngine(
  options: CaptureRuleEngineOptions | undefined,
): CaptureRuleEngine | undefined {
  try {
    return createCaptureRuleEngine(options ?? {});
  } catch {
    return undefined;
  }
}

function getHeaderValue(
  headers: RequestHeaderLike[] | undefined,
  headerName: string,
): string | undefined {
  return headers?.find(
    (header) => header.name.toLowerCase() === headerName.toLowerCase(),
  )?.value;
}

function getContentLength(request: RequestLike): number | undefined {
  const value = Number(getHeaderValue(request.responseHeaders, 'content-length'));

  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function promoteRuleCapturedRequest(
  classification: RequestClassification,
): RequestClassification {
  if (classification.category !== 'unknown' && classification.category !== 'ignored') {
    return classification;
  }

  return {
    ...classification,
    category: 'direct_media',
    protocol: 'direct',
    mediaKind: 'video',
    evidence: {
      ...classification.evidence,
      confidence: Math.max(classification.evidence.confidence, 0.7),
      notes: [
        ...(classification.evidence.notes ?? []).filter(
          (note) => !note.startsWith('category:'),
        ),
        'category:direct_media',
        'capture-rule:custom',
      ],
    },
  };
}

function buildNetworkEvidence(
  tabId: number,
  request: RequestLike,
  regexClassifier: RegexClassifier | undefined,
  captureRuleEngine: CaptureRuleEngine | undefined,
): NetworkRequestEvidence | undefined {
  const baseClassification = applyRegexClassification(
    request,
    classifyRequest(request),
    regexClassifier,
  );
  const contentLength = getContentLength(request);
  const shouldCapture = captureRuleEngine?.shouldCapture({
    url: request.url,
    contentType: baseClassification.mimeType,
    ...(contentLength !== undefined ? { size: contentLength } : {}),
  }) ?? baseClassification.category !== 'unknown';

  if (!shouldCapture) {
    return undefined;
  }

  const classification = promoteRuleCapturedRequest(baseClassification);
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
  let regexClassifier = createOptionalRegexClassifier(options.captureRules);
  let captureRuleEngine = createOptionalCaptureRuleEngine(options.captureRules);

  const persistKey = options.persistKey ?? 'request-journal';
  const writer = options.persistence
    ? createDebouncedWriter(async () => {
        const snapshot: JournalSnapshot = Array.from(evidenceByTabId.entries());
        await options.persistence?.write(persistKey, snapshot);
      }, options.debounceMs ?? 500)
    : undefined;

  function persist(): void {
    writer?.schedule();
  }

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
      const tabEvidence = { ...evidence, tabId };

      if (isDuplicate(tabId, tabEvidence)) {
        return cloneNetworkEvidence(tabEvidence);
      }

      const entries = evidenceByTabId.get(tabId) ?? [];
      const nextEntries = [...entries, cloneNetworkEvidence(tabEvidence)].slice(
        -maxEntriesPerTab,
      );

      evidenceByTabId.set(tabId, nextEntries);
      persist();

      return cloneNetworkEvidence(tabEvidence);
    },

    addRequest(tabId, request) {
      const evidence = buildNetworkEvidence(
        tabId,
        request,
        regexClassifier,
        captureRuleEngine,
      );

      return evidence ? this.add(tabId, evidence) : undefined;
    },

    get(tabId) {
      return (evidenceByTabId.get(tabId) ?? []).map(cloneNetworkEvidence);
    },

    tabIds() {
      return Array.from(evidenceByTabId.keys());
    },

    clear(tabId) {
      if (evidenceByTabId.delete(tabId)) {
        persist();
      }
    },

    updateCaptureRules(nextOptions) {
      regexClassifier = createOptionalRegexClassifier(nextOptions);
      captureRuleEngine = createOptionalCaptureRuleEngine(nextOptions);
    },

    async rehydrate() {
      const snapshot = await options.persistence?.read<JournalSnapshot>(persistKey);
      if (!snapshot) {
        return;
      }

      evidenceByTabId.clear();
      for (const [tabId, entries] of snapshot) {
        evidenceByTabId.set(tabId, entries);
      }
    },

    async flush() {
      await writer?.flushNow();
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
