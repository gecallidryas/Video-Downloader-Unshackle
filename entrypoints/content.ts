import { defineContentScript } from 'wxt/utils/define-content-script';
import type { DetectionEvidence } from '@/video_downloader_types_skeleton';
import { collectPageContext } from '@/src/content/dom/collect-page-context';
import { detectBlobMedia } from '@/src/content/dom/blob-m3u8-scanner';
import { extractMediaResources } from '@/src/content/dom/performance-extractor';
import { extractPlayerSources } from '@/src/content/dom/player-extractor';
import { scanEmbedSignals } from '@/src/content/dom/scan-embed-signals';
import { scanIframes } from '@/src/content/dom/scan-iframes';
import { scanMediaElements } from '@/src/content/dom/scan-media-elements';
import { scanPlayerSignals } from '@/src/content/dom/scan-player-signals';
import { registerMediaControlListener } from '@/src/content/media-control-bridge';
import { SETTINGS_STORAGE_KEY } from '@/src/background/settings/settings-store';
import { createRuntimeRequest } from '@/src/shared/contracts/messages';

interface SettingsStorageLike {
  get(key: string): Promise<Record<string, unknown>>;
}

export interface CollectPageMediaEvidenceOptions {
  advancedMode?: boolean;
  now?: () => number;
  performanceEntries?: PerformanceResourceTiming[];
  windowRef?: unknown;
}

export interface SubmitPageMediaEvidenceOptions
  extends CollectPageMediaEvidenceOptions {
  storage?: SettingsStorageLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDefaultSettingsStorage(): SettingsStorageLike | undefined {
  return typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
}

async function readAdvancedMode(
  storage: SettingsStorageLike | undefined,
): Promise<boolean> {
  try {
    const stored = await storage?.get(SETTINGS_STORAGE_KEY);
    const settings = stored?.[SETTINGS_STORAGE_KEY];

    return isRecord(settings) && settings.advancedMode === true;
  } catch {
    return false;
  }
}

function buildPerformanceEvidence(
  urls: string[],
  now: () => number,
): DetectionEvidence[] {
  return urls.map((url) => ({
    source: 'player-config',
    confidence: 0.55,
    url,
    notes: ['advanced-scanner:performance'],
    createdAt: now(),
  }));
}

function buildPlayerObjectEvidence(
  sources: ReturnType<typeof extractPlayerSources>,
  now: () => number,
): DetectionEvidence[] {
  return sources.map((source) => ({
    source: 'player-config',
    confidence: 0.7,
    url: source.url,
    notes: [
      `advanced-scanner:${source.source}`,
      ...(source.mimeType ? [`mime-type:${source.mimeType}`] : []),
      ...(source.title ? [`title:${source.title}`] : []),
    ],
    createdAt: now(),
  }));
}

function buildBlobEvidence(
  diagnostics: ReturnType<typeof detectBlobMedia>,
): DetectionEvidence[] {
  return diagnostics.map((diagnostic) => ({
    source: 'blob-correlation',
    confidence: 0.5,
    url: diagnostic.url,
    elementSelector: diagnostic.elementSelector,
    notes: [
      'advanced-scanner:blob',
      `protocol:${diagnostic.protocol}`,
      `media-kind:${diagnostic.mediaKind}`,
      `mime-type:${diagnostic.type}`,
    ],
    createdAt: diagnostic.createdAt,
  }));
}

export function collectPageMediaEvidence(
  options: CollectPageMediaEvidenceOptions = {},
) {
  const now = options.now ?? (() => Date.now());
  const pageContext = collectPageContext(document);
  const domEvidence = scanMediaElements(document, { pageContext });
  const iframeEvidence = scanIframes(document);
  const embedEvidence = scanEmbedSignals(document);
  const advancedEvidence = options.advancedMode
    ? [
        ...buildPerformanceEvidence(
          extractMediaResources(options.performanceEntries, { advancedMode: true }),
          now,
        ),
        ...buildPlayerObjectEvidence(
          extractPlayerSources(options.windowRef, { advancedMode: true }),
          now,
        ),
        ...buildBlobEvidence(
          detectBlobMedia(document, { advancedMode: true, now }),
        ),
      ]
    : [];

  const playerSignals = scanPlayerSignals([
    ...domEvidence,
    ...iframeEvidence.domEvidence,
  ], { now });

  return {
    ...playerSignals,
    evidence: [
      ...playerSignals.evidence,
      ...iframeEvidence.embedEvidence,
      ...embedEvidence,
      ...advancedEvidence,
    ],
    pageContext,
  };
}

export async function submitPageMediaEvidence(
  runtime: Pick<typeof chrome.runtime, 'sendMessage'> | undefined =
    typeof chrome !== 'undefined' ? chrome.runtime : undefined,
  options: SubmitPageMediaEvidenceOptions = {},
) {
  const advancedMode =
    options.advancedMode ?? (await readAdvancedMode(options.storage ?? getDefaultSettingsStorage()));
  const pageMedia = collectPageMediaEvidence({
    ...options,
    advancedMode,
  });
  const evidence = [...pageMedia.domEvidence, ...pageMedia.evidence];

  if (!runtime?.sendMessage || evidence.length === 0) {
    return;
  }

  try {
    await runtime.sendMessage(
      createRuntimeRequest('INGEST_CONTENT_EVIDENCE', {
        pageUrl: location.href,
        pageTitle: document.title || undefined,
        evidence,
        pageContext: pageMedia.pageContext,
      }),
    );
  } catch {
    // The passive network journal remains the fallback if content messaging is unavailable.
  }
}

export function relayMainWorldMessages(
  runtime: Pick<typeof chrome.runtime, 'sendMessage'> | undefined =
    typeof chrome !== 'undefined' ? chrome.runtime : undefined,
): void {
  if (!runtime?.sendMessage) {
    return;
  }

  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    const { type } = event.data as { type?: string };

    if (type === 'iq_on_config') {
      const payload = (event.data as { payload?: { title?: string; m3u8Urls?: string[] } }).payload;
      if (!payload?.m3u8Urls?.length) return;
      try {
        void runtime.sendMessage(
          createRuntimeRequest('INGEST_IQIYI_CONFIG', {
            pageUrl: location.href,
            title: payload.title ?? document.title ?? 'iQIYI',
            m3u8Urls: payload.m3u8Urls,
          }),
        );
      } catch {
        // Extension context may be invalidated; fail silently.
      }
      return;
    }

    if (type === 'unshackle_drm_detected') {
      const data = event.data as { drmName?: string; trigger?: string; url?: string };
      if (!data.drmName) return;
      try {
        void runtime.sendMessage(
          createRuntimeRequest('DRM_DETECTED', {
            drmName: data.drmName,
            trigger: data.trigger ?? '',
            url: data.url ?? location.href,
          }),
        );
      } catch {
        // Extension context may be invalidated; fail silently.
      }
    }
  });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  matchAboutBlank: true,
  main() {
    void submitPageMediaEvidence();
    relayMainWorldMessages();
    registerMediaControlListener();
  },
});
