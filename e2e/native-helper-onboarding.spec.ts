import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';

const extensionPath = resolve('.output/chrome-mv3');

type NativeMockMode = 'permission-needed' | 'host-missing' | 'ready';

test.describe('native helper onboarding popup', () => {
  test.skip(
    !existsSync(join(extensionPath, 'manifest.json')),
    'Run npm run build before npm run test:e2e.',
  );

  let contexts: Array<{ context: BrowserContext; userDataDir: string }> = [];

  test.afterEach(async () => {
    for (const item of contexts) {
      await item.context.close();
      rmSync(item.userDataDir, { recursive: true, force: true });
    }
    contexts = [];
  });

  async function openPopup(mode: NativeMockMode) {
    const userDataDir = mkdtempSync(join(tmpdir(), 'unshackle-onboarding-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    contexts.push({ context, userDataDir });

    await context.addInitScript((mockMode) => {
      const chromeApi = globalThis.chrome;
      if (!chromeApi?.runtime) return;

      chromeApi.permissions = chromeApi.permissions ?? {};
      chromeApi.permissions.contains = (_query, callback) => {
        callback(mockMode !== 'permission-needed');
      };
      chromeApi.permissions.request = (_query, callback) => {
        callback(true);
      };
      chromeApi.runtime.sendNativeMessage = (_hostName, message, callback) => {
        if (mockMode === 'host-missing') {
          Object.defineProperty(chromeApi.runtime, 'lastError', {
            configurable: true,
            value: { message: 'Specified native messaging host not found.' },
          });
          callback(undefined);
          Object.defineProperty(chromeApi.runtime, 'lastError', {
            configurable: true,
            value: undefined,
          });
          return;
        }

        callback({
          type: 'PONG',
          requestId: message.requestId,
          payload: {
            version: '0.1.0',
            ffmpegAvailable: true,
            ffprobeAvailable: true,
            platform: 'win32',
            installKind: 'per-user',
          },
        });
      };
    }, mode);

    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(serviceWorker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    return page;
  }

  test('shows permission-needed state when permission is absent', async () => {
    const page = await openPopup('permission-needed');

    await expect(page.getByText(/welcome to unshackle/i)).toBeVisible();
    await expect(page.getByText(/permission needed/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /enable native helper/i }).first()).toBeVisible();
  });

  test('shows helper missing state when permission is granted but native ping fails', async () => {
    const page = await openPopup('host-missing');

    await expect(page.getByText(/helper not installed/i)).toBeVisible();
    await expect(page.getByText(/powershell setup wrapper/i)).toBeVisible();
  });

  test('shows ready state when native ping succeeds', async () => {
    const page = await openPopup('ready');

    await expect(page.getByText(/ready/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /complete/i })).toBeVisible();
  });
});
