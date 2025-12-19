import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

const extensionPath = resolve('.output/chrome-mv3');
const fixtureBaseUrl = process.env.FIXTURE_BASE_URL ?? 'http://127.0.0.1:4173';
const manifestPath = join(extensionPath, 'manifest.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : {};
const hasRuntimeFixturePermissions =
  new Set<string>(manifest.permissions ?? []).has('downloads') &&
  new Set<string>(manifest.permissions ?? []).has('webRequest') &&
  new Set<string>(manifest.permissions ?? []).has('tabs') &&
  new Set<string>(manifest.host_permissions ?? []).has('<all_urls>');

test.describe('browser fallback downloads', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(
    !existsSync(join(extensionPath, 'manifest.json')),
    'Run npm run build before npm run test:e2e.',
  );
  test.skip(
    !hasRuntimeFixturePermissions,
    'Browser fallback E2E requires downloads, tabs, webRequest, and <all_urls> in the built manifest.',
  );

  let context: BrowserContext;
  let sidePanelPage: Page;
  let fixturePage: Page;
  let userDataDir = '';
  let extensionId = '';

  async function sendRuntimeMessage<TPayload extends Record<string, unknown>>(
    type: string,
    payload: TPayload,
  ) {
    return sidePanelPage.evaluate(
      ({ messageType, messagePayload }) =>
        chrome.runtime.sendMessage({
          type: messageType,
          requestId: `fallback-e2e-${Date.now()}-${Math.random()}`,
          payload: messagePayload,
        }),
      { messageType: type, messagePayload: payload },
    );
  }

  async function fixtureTabId(): Promise<number> {
    await expect
      .poll(async () =>
        sidePanelPage.evaluate(async (baseUrl) => {
          const tabs = await chrome.tabs.query({});
          return tabs.find((tab) => tab.url?.startsWith(baseUrl))?.id ?? 0;
        }, fixtureBaseUrl),
      )
      .toBeGreaterThan(0);

    return sidePanelPage.evaluate(async (baseUrl) => {
      const tabs = await chrome.tabs.query({});
      return tabs.find((tab) => tab.url?.startsWith(baseUrl))?.id ?? 0;
    }, fixtureBaseUrl);
  }

  async function candidates() {
    const tabId = await fixtureTabId();
    await fixturePage.evaluate(() => window.runFixtureRequests?.());
    await expect
      .poll(async () => {
        const response = await sendRuntimeMessage('GET_CANDIDATES', { tabId });
        return response?.payload?.candidates?.length ?? 0;
      })
      .toBeGreaterThan(2);

    const response = await sendRuntimeMessage('GET_CANDIDATES', { tabId });
    return response?.payload?.candidates ?? [];
  }

  async function clearDownloadHistory() {
    await sidePanelPage.evaluate(async () => {
      const downloads = await chrome.downloads.search({});
      await Promise.all(downloads.map((item) => chrome.downloads.erase({ id: item.id })));
    });
  }

  async function waitForQueueIdle() {
    await expect
      .poll(async () => {
        const response = await sendRuntimeMessage('GET_QUEUE_STATS', {});
        const stats = response?.payload?.stats;
        return `${stats?.queued ?? 0}:${stats?.running ?? 0}`;
      })
      .toBe('0:0');
  }

  async function downloadedItemMatching(input: {
    finalUrl?: RegExp;
    mime?: RegExp;
  }): Promise<chrome.downloads.DownloadItem> {
    await expect
      .poll(async () =>
        sidePanelPage.evaluate(async ({ finalUrlSource, mimeSource }) => {
          const finalUrlPattern = finalUrlSource ? new RegExp(finalUrlSource) : undefined;
          const mimePattern = mimeSource ? new RegExp(mimeSource) : undefined;
          const downloads = await chrome.downloads.search({});
          const match = downloads.find(
            (item) =>
              (!finalUrlPattern || finalUrlPattern.test(item.finalUrl || item.url)) &&
              (!mimePattern || mimePattern.test(item.mime || '')),
          );
          return match?.id ?? 0;
        }, {
          finalUrlSource: input.finalUrl?.source,
          mimeSource: input.mime?.source,
        }),
      )
      .toBeGreaterThan(0);

    return sidePanelPage.evaluate(async ({ finalUrlSource, mimeSource }) => {
      const finalUrlPattern = finalUrlSource ? new RegExp(finalUrlSource) : undefined;
      const mimePattern = mimeSource ? new RegExp(mimeSource) : undefined;
      const downloads = await chrome.downloads.search({});
      const match = downloads.find(
        (item) =>
          (!finalUrlPattern || finalUrlPattern.test(item.finalUrl || item.url)) &&
          (!mimePattern || mimePattern.test(item.mime || '')),
      );
      if (!match) {
        throw new Error('Expected matching download item.');
      }
      return match;
    }, {
      finalUrlSource: input.finalUrl?.source,
      mimeSource: input.mime?.source,
    });
  }

  function findCandidate(
    items: Array<{ protocol?: string; sourceUrl?: string; manifestUrl?: string }>,
    protocol: string,
    pattern: RegExp,
  ) {
    return items.find(
      (item) =>
        item.protocol === protocol &&
        pattern.test(`${item.sourceUrl ?? ''} ${item.manifestUrl ?? ''}`),
    );
  }

  test.beforeAll(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'unshackle-browser-fallback-e2e-'));
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    extensionId = new URL(serviceWorker.url()).host;

    fixturePage = await context.newPage();
    await fixturePage.goto(`${fixtureBaseUrl}/index.html`, { waitUntil: 'load' });
    await fixturePage.evaluate(() => window.runFixtureRequests?.());

    sidePanelPage = await context.newPage();
    await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  });

  test.afterAll(async () => {
    await context?.close();
    if (userDataDir) {
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('direct media starts through browser downloads without native helper', async () => {
    await clearDownloadHistory();
    const direct = findCandidate(await candidates(), 'direct', /\/media\/sample\.mp4/i);
    expect(direct).toBeTruthy();

    const response = await sendRuntimeMessage('START_DOWNLOAD', {
      candidateId: direct.id,
      selection: { mode: 'best' },
    });

    expect(response?.type).toBe('START_DOWNLOAD_RESULT');
    await expect(
      downloadedItemMatching({
        finalUrl: /\/media\/sample\.mp4$/i,
        mime: /^video\/mp4$/i,
      }),
    ).resolves.toMatchObject({ mime: 'video/mp4' });
  });

  test('HLS fixture produces a raw TS browser download', async () => {
    await clearDownloadHistory();
    const hls = findCandidate(await candidates(), 'hls', /\/hls\/master\.m3u8/i);
    expect(hls).toBeTruthy();

    const response = await sendRuntimeMessage('START_DOWNLOAD', {
      candidateId: hls.id,
      selection: { mode: 'best' },
    });

    expect(response?.type).toBe('START_DOWNLOAD_RESULT');
    await waitForQueueIdle();
    await expect(
      downloadedItemMatching({ mime: /^video\/mp2t$/i }),
    ).resolves.toMatchObject({ mime: 'video/mp2t' });
  });

  test('DASH fixture produces raw segment output without MP4 labeling', async () => {
    await clearDownloadHistory();
    const dash = findCandidate(await candidates(), 'dash', /\/dash\/manifest\.mpd/i);
    expect(dash).toBeTruthy();

    await sendRuntimeMessage('START_DOWNLOAD', {
      candidateId: dash.id,
      selection: { mode: 'best' },
    });

    await waitForQueueIdle();
    await expect(
      downloadedItemMatching({ mime: /^(video\/iso\.segment|application\/octet-stream)$/i }),
    ).resolves.toEqual(
      expect.objectContaining({
        mime: expect.stringMatching(/^(video\/iso\.segment|application\/octet-stream)$/i),
      }),
    );
  });

  test('direct preview and thumbnail assets succeed through browser fallbacks', async () => {
    const direct = findCandidate(await candidates(), 'direct', /\/media\/sample\.webm/i);
    expect(direct).toBeTruthy();

    const preview = await sendRuntimeMessage('GET_PREVIEW_ASSET', {
      candidateId: direct.id,
      format: 'webm',
    });
    expect(preview?.type).toBe('GET_PREVIEW_ASSET_RESULT');
    expect(preview?.payload?.assetUrl).toBeTruthy();

    const thumbnail = await sendRuntimeMessage('GET_THUMBNAIL_ASSET', {
      candidateId: direct.id,
    });
    expect(thumbnail?.type).toBe('GET_THUMBNAIL_ASSET_RESULT');
    expect(thumbnail?.payload?.assetUrl).toBeTruthy();
  });
});
