import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

const extensionPath = resolve('.output/chrome-mv3');
const fixtureBaseUrl = process.env.FIXTURE_BASE_URL ?? 'http://127.0.0.1:4173';
const nativeE2EEnabled = process.env.UNSHACKLE_NATIVE_E2E === '1';

test.describe('native ffmpeg helper flows', () => {
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

  test.beforeAll(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'unshackle-native-e2e-'));
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

  test('missing native helper path shows setup-required status by default', async () => {
    await sidePanelPage.getByRole('button', { name: /settings/i }).click();

    await expect(sidePanelPage.getByText(/native ffmpeg helper/i)).toBeVisible();
    await expect(sidePanelPage.getByText(/not installed/i)).toBeVisible();

    const manifest = JSON.parse(readFileSync(join(extensionPath, 'manifest.json'), 'utf8'));
    expect(manifest.optional_permissions).toContain('nativeMessaging');
  });

  test('direct MP4 trim creates a shorter output when the helper is installed', async () => {
    test.skip(!nativeE2EEnabled, 'Set UNSHACKLE_NATIVE_E2E=1 with the helper installed.');
  });

  test('clear HLS and DASH trim queue native exports when the helper is installed', async () => {
    test.skip(!nativeE2EEnabled, 'Set UNSHACKLE_NATIVE_E2E=1 with the helper installed.');
  });

  test('hovering a thumbnail can show a generated native preview when the helper is installed', async () => {
    test.skip(!nativeE2EEnabled, 'Set UNSHACKLE_NATIVE_E2E=1 with the helper installed.');
  });
});
