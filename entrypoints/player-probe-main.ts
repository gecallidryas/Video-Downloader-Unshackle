import { defineContentScript } from 'wxt/utils/define-content-script';

// Runs in MAIN world at document_start so it patches fetch/XHR/MediaSource before
// any JS player (hls.js/shaka/dash.js) constructs them. Detection only — it never
// reads or buffers segment bytes. Candidates are posted to the content script,
// which classifies + relays them to the background.
export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const seenRequests = new Set<string>();
    let mseReported = false;

    function reportRequest(
      url: string,
      contentType: string | undefined,
      via: 'fetch' | 'xhr',
    ): void {
      if (!url || seenRequests.has(url)) return;
      seenRequests.add(url);
      window.postMessage(
        { type: 'unshackle_media_request', url, contentType, via },
        '*',
      );
    }

    function reportMse(mime: string | undefined): void {
      if (mseReported) return;
      mseReported = true;
      window.postMessage({ type: 'unshackle_mse_activity', mime }, '*');
    }

    function absolute(url: string): string {
      try {
        return new URL(url, location.href).href;
      } catch {
        return url;
      }
    }

    // --- fetch hook ---
    const origFetch = window.fetch?.bind(window);
    if (origFetch) {
      window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        return origFetch(input, init).then((response) => {
          try {
            reportRequest(
              absolute(requestUrl),
              response.headers.get('content-type') ?? undefined,
              'fetch',
            );
          } catch {
            // Detection must never break the page's own fetch.
          }
          return response;
        });
      };
    }

    // --- XHR hook ---
    const XHR = window.XMLHttpRequest;
    if (XHR) {
      const origOpen = XHR.prototype.open;
      const origSend = XHR.prototype.send;
      type TrackedXHR = XMLHttpRequest & { _ushUrl?: string };

      XHR.prototype.open = function (
        this: TrackedXHR,
        method: string,
        url: string | URL,
        async?: boolean,
        user?: string | null,
        password?: string | null,
      ) {
        this._ushUrl = typeof url === 'string' ? url : url.href;
        return origOpen.call(this, method, url, async ?? true, user, password);
      } as typeof origOpen;

      XHR.prototype.send = function (this: TrackedXHR, body?: Document | XMLHttpRequestBodyInit | null) {
        this.addEventListener('load', () => {
          try {
            const url = this._ushUrl;
            if (!url) return;
            reportRequest(
              absolute(url),
              this.getResponseHeader('content-type') ?? undefined,
              'xhr',
            );
          } catch {
            // Ignore — detection failures must not surface to the page.
          }
        });
        return origSend.call(this, body ?? null);
      };
    }

    // --- MediaSource / appendBuffer hook ---
    const MS = window.MediaSource;
    if (MS) {
      const origAddSourceBuffer = MS.prototype.addSourceBuffer;
      MS.prototype.addSourceBuffer = function (this: MediaSource, mime: string) {
        try {
          reportMse(mime);
        } catch {
          // Ignore — never block buffer creation.
        }
        return origAddSourceBuffer.call(this, mime);
      };

      if (typeof SourceBuffer !== 'undefined') {
        const origAppend = SourceBuffer.prototype.appendBuffer;
        SourceBuffer.prototype.appendBuffer = function (
          this: SourceBuffer,
          data: BufferSource,
        ) {
          try {
            reportMse(undefined);
          } catch {
            // Ignore.
          }
          return origAppend.call(this, data);
        };
      }
    }
  },
});
