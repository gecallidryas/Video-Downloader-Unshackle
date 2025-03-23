import { defineContentScript } from 'wxt/utils/define-content-script';
import { collectPageContext } from '@/src/content/dom/collect-page-context';
import { scanEmbedSignals } from '@/src/content/dom/scan-embed-signals';
import { scanIframes } from '@/src/content/dom/scan-iframes';
import { scanMediaElements } from '@/src/content/dom/scan-media-elements';
import { scanPlayerSignals } from '@/src/content/dom/scan-player-signals';
import { createRuntimeRequest } from '@/src/shared/contracts/messages';

export function collectPageMediaEvidence() {
  const pageContext = collectPageContext(document);
  const domEvidence = scanMediaElements(document, { pageContext });
  const iframeEvidence = scanIframes(document);
  const embedEvidence = scanEmbedSignals(document);

  const playerSignals = scanPlayerSignals([
    ...domEvidence,
    ...iframeEvidence.domEvidence,
  ]);

  return {
    ...playerSignals,
    evidence: [
      ...playerSignals.evidence,
      ...iframeEvidence.embedEvidence,
      ...embedEvidence,
    ],
    pageContext,
  };
}

export async function submitPageMediaEvidence(
  runtime: Pick<typeof chrome.runtime, 'sendMessage'> | undefined =
    typeof chrome !== 'undefined' ? chrome.runtime : undefined,
) {
  const pageMedia = collectPageMediaEvidence();
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
  },
});
