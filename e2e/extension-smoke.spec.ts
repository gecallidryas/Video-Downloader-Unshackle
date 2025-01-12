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
const manifestPermissions = new Set<string>(manifest.permissions ?? []);
const manifestHostPermissions = new Set<string>(manifest.host_permissions ?? []);
const hasRuntimeFixturePermissions =
  manifestPermissions.has('tabs') &&
  manifestPermissions.has('webRequest') &&
  manifestPermissions.has('downloads') &&
  manifestHostPermissions.has('<all_urls>');

test.describe('extension fixture smoke', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(
    !existsSync(join(extensionPath, 'manifest.json')),
    'Run npm run build before npm run test:e2e.',
  );

  let context: BrowserContext;
  let sidePanelPage: Page;
  let fixturePage: Page;
  let userDataDir = '';
  let extensionId = '';

  async function sendRuntimeMessage<TPayload extends Record<string, unknown>>(
    page: Page,
    type: string,
    payload: TPayload,
  ) {
    return page.evaluate(
      ({ messageType, messagePayload }) =>
        chrome.runtime.sendMessage({
          type: messageType,
          requestId: `e2e-${Date.now()}`,
          payload: messagePayload,
        }),
      { messageType: type, messagePayload: payload },
    );
  }

  async function waitForFixtureTabId(page: Page): Promise<number> {
    return expect
      .poll(async () =>
        page.evaluate(async (baseUrl) => {
          const tabs = await chrome.tabs.query({});
          const tab = tabs.find((item) => item.url?.startsWith(baseUrl));

          return tab?.id ?? 0;
        }, fixtureBaseUrl),
      )
      .toBeGreaterThan(0)
      .then(async () =>
        page.evaluate(async (baseUrl) => {
          const tabs = await chrome.tabs.query({});
          const tab = tabs.find((item) => item.url?.startsWith(baseUrl));

          return tab?.id ?? 0;
        }, fixtureBaseUrl),
      );
  }

  async function waitForCandidates(tabId: number) {
    await expect
      .poll(async () => {
        const response = await sendRuntimeMessage(sidePanelPage, 'GET_CANDIDATES', {
          tabId,
        });

        return response?.payload?.candidates?.length ?? 0;
      })
      .toBeGreaterThan(0);

    const response = await sendRuntimeMessage(sidePanelPage, 'GET_CANDIDATES', {
      tabId,
    });

    return response?.payload?.candidates ?? [];
  }

  test.beforeAll(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'unshackle-e2e-'));
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
  });

  test.afterAll(async () => {
    await context?.close();
    if (userDataDir) {
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('extension loads the side panel shell', async () => {
    sidePanelPage = await context.newPage();
    await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    await expect(sidePanelPage.getByText('Video Downloader')).toBeVisible();
  });

  test('direct media appears in the side panel', async () => {
    test.skip(
      !hasRuntimeFixturePermissions,
      'Fixture-flow E2E requires tabs, webRequest, downloads, and <all_urls> in the built manifest.',
    );
    const fixtureTabId = await waitForFixtureTabId(sidePanelPage);
    await fixturePage.evaluate(() => window.runFixtureRequests?.());
    await waitForCandidates(fixtureTabId);

    await sidePanelPage.goto(
      `chrome-extension://${extensionId}/sidepanel.html?tabId=${fixtureTabId}`,
    );

    await expect(sidePanelPage.getByText(/sample\.mp4|Fixture/i)).toBeVisible();
    await expect(
      sidePanelPage.getByRole('button', { name: /^download$/i }).first(),
    ).toBeVisible();
  });

  test('HLS and DASH fixtures expose quality options', async () => {
    test.skip(
      !hasRuntimeFixturePermissions,
      'Fixture-flow E2E requires tabs, webRequest, downloads, and <all_urls> in the built manifest.',
    );
    const fixtureTabId = await waitForFixtureTabId(sidePanelPage);
    await fixturePage.evaluate(() => window.runFixtureRequests?.());
    const candidates = await waitForCandidates(fixtureTabId);

    expect(candidates.some((candidate) => candidate.protocol === 'hls')).toBe(true);
    expect(candidates.some((candidate) => candidate.protocol === 'dash')).toBe(true);
    expect(
      candidates.some(
        (candidate) =>
          (candidate.protocol === 'hls' || candidate.protocol === 'dash') &&
          candidate.variants.length > 0,
      ),
    ).toBe(true);
  });

  test('protected fixture is blocked with warning state', async () => {
    test.skip(
      !hasRuntimeFixturePermissions,
      'Fixture-flow E2E requires tabs, webRequest, downloads, and <all_urls> in the built manifest.',
    );
    const fixtureTabId = await waitForFixtureTabId(sidePanelPage);
    await fixturePage.evaluate(() => window.runFixtureRequests?.());
    const candidates = await waitForCandidates(fixtureTabId);

    expect(
      candidates.every(
        (candidate) =>
          candidate.protection.kind !== 'drm' || candidate.status === 'protected',
      ),
    ).toBe(true);
  });

  test('clear fixture can start a queued job', async () => {
    test.skip(
      !hasRuntimeFixturePermissions,
      'Fixture-flow E2E requires tabs, webRequest, downloads, and <all_urls> in the built manifest.',
    );
    const fixtureTabId = await waitForFixtureTabId(sidePanelPage);
    await fixturePage.evaluate(() => window.runFixtureRequests?.());
    const candidates = await waitForCandidates(fixtureTabId);
    const candidate = candidates.find(
      (item) => item.protocol === 'direct' && item.status === 'ready',
    );

    expect(candidate).toBeTruthy();

    const started = await sendRuntimeMessage(sidePanelPage, 'START_DOWNLOAD', {
      candidateId: candidate.id,
      selection: { mode: 'best' },
    });

    expect(started?.type).toBe('START_DOWNLOAD_RESULT');
    expect(started?.payload?.job?.candidateId).toBe(candidate.id);
  });
});
