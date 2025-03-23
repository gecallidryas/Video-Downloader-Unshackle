import { defineContentScript } from 'wxt/utils/define-content-script';

const MAX_URLS = 20;
const CHANNEL_TYPE = 'iq_on_config';

// Runs in MAIN world on iq.com/iqiyi.com pages — reads player config globals
export default defineContentScript({
  matches: ['*://*.iq.com/*', '*://*.iqiyi.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    function collectM3u8Urls(value: unknown, out: Set<string>): void {
      if (!value || typeof value !== 'object') {
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          collectM3u8Urls(item, out);
        }
        return;
      }

      for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'string') {
          if (entry.includes('.m3u8') || key.toLowerCase().includes('m3u8')) {
            out.add(entry);
          }
        } else {
          collectM3u8Urls(entry, out);
        }
      }
    }

    function buildPayload() {
      const win = window as unknown as Record<string, unknown>;
      const dash = win.__dash ?? win.__dashData ?? null;
      if (!dash || typeof dash !== 'object') return null;

      const data = (dash as { data?: unknown }).data;
      const program =
        data && typeof data === 'object'
          ? ((data as { program?: unknown; video?: unknown }).program ??
            (data as { video?: unknown }).video ??
            data)
          : dash;

      const nameOrTitle =
        (program as { name?: string; title?: string }).name ||
        (program as { title?: string }).title ||
        document.title ||
        'iQIYI';

      const urls = new Set<string>();
      collectM3u8Urls(program, urls);

      if (urls.size === 0) return null;

      return {
        type: CHANNEL_TYPE,
        payload: {
          title: nameOrTitle,
          m3u8Urls: Array.from(urls).slice(0, MAX_URLS),
        },
      };
    }

    function tryPost() {
      const payload = buildPayload();
      if (payload) {
        window.postMessage(payload, '*');
      }
    }

    // Try immediately and again after a short delay for lazy-loaded player
    tryPost();
    setTimeout(tryPost, 2000);
  },
});
