# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: extension-smoke.spec.ts >> extension fixture smoke >> extension loads the side panel shell
- Location: e2e\extension-smoke.spec.ts:84:3

# Error details

```
Error: browserType.launchPersistentContext: Executable doesn't exist at C:\Users\Hp\AppData\Local\ms-playwright\chromium_headless_shell-1217\chrome-headless-shell-win64\chrome-headless-shell.exe
╔════════════════════════════════════════════════════════════╗
║ Looks like Playwright was just installed or updated.       ║
║ Please run the following command to download new browsers: ║
║                                                            ║
║     npx playwright install                                 ║
║                                                            ║
║ <3 Playwright Team                                         ║
╚════════════════════════════════════════════════════════════╝
```

# Test source

```ts
  1   | import { existsSync, mkdtempSync, rmSync } from 'node:fs';
  2   | import { tmpdir } from 'node:os';
  3   | import { join, resolve } from 'node:path';
  4   | import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
  5   | 
  6   | const extensionPath = resolve('.output/chrome-mv3');
  7   | const fixtureBaseUrl = process.env.FIXTURE_BASE_URL ?? 'http://127.0.0.1:4173';
  8   | 
  9   | test.describe('extension fixture smoke', () => {
  10  |   test.describe.configure({ mode: 'serial' });
  11  |   test.skip(
  12  |     !existsSync(join(extensionPath, 'manifest.json')),
  13  |     'Run npm run build before npm run test:e2e.',
  14  |   );
  15  | 
  16  |   let context: BrowserContext;
  17  |   let sidePanelPage: Page;
  18  |   let fixturePage: Page;
  19  |   let userDataDir = '';
  20  |   let extensionId = '';
  21  | 
  22  |   async function sendRuntimeMessage<TPayload extends Record<string, unknown>>(
  23  |     page: Page,
  24  |     type: string,
  25  |     payload: TPayload,
  26  |   ) {
  27  |     return page.evaluate(
  28  |       ({ messageType, messagePayload }) =>
  29  |         chrome.runtime.sendMessage({
  30  |           type: messageType,
  31  |           requestId: `e2e-${Date.now()}`,
  32  |           payload: messagePayload,
  33  |         }),
  34  |       { messageType: type, messagePayload: payload },
  35  |     );
  36  |   }
  37  | 
  38  |   async function waitForFixtureTabId(page: Page): Promise<number> {
  39  |     return expect
  40  |       .poll(async () =>
  41  |         page.evaluate(async (baseUrl) => {
  42  |           const tabs = await chrome.tabs.query({});
  43  |           const tab = tabs.find((item) => item.url?.startsWith(baseUrl));
  44  | 
  45  |           return tab?.id ?? 0;
  46  |         }, fixtureBaseUrl),
  47  |       )
  48  |       .toBeGreaterThan(0)
  49  |       .then(async () =>
  50  |         page.evaluate(async (baseUrl) => {
  51  |           const tabs = await chrome.tabs.query({});
  52  |           const tab = tabs.find((item) => item.url?.startsWith(baseUrl));
  53  | 
  54  |           return tab?.id ?? 0;
  55  |         }, fixtureBaseUrl),
  56  |       );
  57  |   }
  58  | 
  59  |   test.beforeAll(async () => {
  60  |     userDataDir = mkdtempSync(join(tmpdir(), 'unshackle-e2e-'));
> 61  |     context = await chromium.launchPersistentContext(userDataDir, {
      |               ^ Error: browserType.launchPersistentContext: Executable doesn't exist at C:\Users\Hp\AppData\Local\ms-playwright\chromium_headless_shell-1217\chrome-headless-shell-win64\chrome-headless-shell.exe
  62  |       args: [
  63  |         `--disable-extensions-except=${extensionPath}`,
  64  |         `--load-extension=${extensionPath}`,
  65  |       ],
  66  |     });
  67  | 
  68  |     const serviceWorker =
  69  |       context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  70  |     extensionId = new URL(serviceWorker.url()).host;
  71  | 
  72  |     fixturePage = await context.newPage();
  73  |     await fixturePage.goto(`${fixtureBaseUrl}/index.html`, { waitUntil: 'load' });
  74  |     await fixturePage.evaluate(() => window.runFixtureRequests?.());
  75  |   });
  76  | 
  77  |   test.afterAll(async () => {
  78  |     await context?.close();
  79  |     if (userDataDir) {
  80  |       rmSync(userDataDir, { recursive: true, force: true });
  81  |     }
  82  |   });
  83  | 
  84  |   test('extension loads the side panel shell', async () => {
  85  |     sidePanelPage = await context.newPage();
  86  |     await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  87  | 
  88  |     await expect(sidePanelPage.getByText('Video Downloader')).toBeVisible();
  89  |   });
  90  | 
  91  |   test('direct media appears in the side panel', async () => {
  92  |     const fixtureTabId = await waitForFixtureTabId(sidePanelPage);
  93  | 
  94  |     await sidePanelPage.goto(
  95  |       `chrome-extension://${extensionId}/sidepanel.html?tabId=${fixtureTabId}`,
  96  |     );
  97  | 
  98  |     await expect(sidePanelPage.getByText(/sample\.mp4|Fixture/i)).toBeVisible();
  99  |     await expect(sidePanelPage.getByRole('button', { name: /^download$/i })).toBeVisible();
  100 |   });
  101 | 
  102 |   test('HLS and DASH fixtures expose quality options', async () => {
  103 |     const fixtureTabId = await waitForFixtureTabId(sidePanelPage);
  104 |     const response = await sendRuntimeMessage(sidePanelPage, 'GET_CANDIDATES', {
  105 |       tabId: fixtureTabId,
  106 |     });
  107 |     const candidates = response?.payload?.candidates ?? [];
  108 | 
  109 |     expect(candidates.some((candidate) => candidate.protocol === 'hls')).toBe(true);
  110 |     expect(candidates.some((candidate) => candidate.protocol === 'dash')).toBe(true);
  111 |     expect(
  112 |       candidates.some(
  113 |         (candidate) =>
  114 |           (candidate.protocol === 'hls' || candidate.protocol === 'dash') &&
  115 |           candidate.variants.length > 0,
  116 |       ),
  117 |     ).toBe(true);
  118 |   });
  119 | 
  120 |   test('protected fixture is blocked with warning state', async () => {
  121 |     const response = await sendRuntimeMessage(sidePanelPage, 'GET_CANDIDATES', {
  122 |       tabId: await waitForFixtureTabId(sidePanelPage),
  123 |     });
  124 |     const candidates = response?.payload?.candidates ?? [];
  125 | 
  126 |     expect(
  127 |       candidates.every(
  128 |         (candidate) =>
  129 |           candidate.protection.kind !== 'drm' || candidate.status === 'protected',
  130 |       ),
  131 |     ).toBe(true);
  132 |   });
  133 | 
  134 |   test('clear fixture can start a queued job', async () => {
  135 |     const fixtureTabId = await waitForFixtureTabId(sidePanelPage);
  136 |     const response = await sendRuntimeMessage(sidePanelPage, 'GET_CANDIDATES', {
  137 |       tabId: fixtureTabId,
  138 |     });
  139 |     const candidate = response?.payload?.candidates?.find(
  140 |       (item) => item.protocol === 'direct' && item.status === 'ready',
  141 |     );
  142 | 
  143 |     expect(candidate).toBeTruthy();
  144 | 
  145 |     const started = await sendRuntimeMessage(sidePanelPage, 'START_DOWNLOAD', {
  146 |       candidateId: candidate.id,
  147 |       selection: { mode: 'best' },
  148 |     });
  149 | 
  150 |     expect(started?.type).toBe('START_DOWNLOAD_RESULT');
  151 |     expect(started?.payload?.job?.candidateId).toBe(candidate.id);
  152 |   });
  153 | });
  154 | 
```