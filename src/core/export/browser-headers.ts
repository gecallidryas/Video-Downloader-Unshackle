export type BrowserKind = 'chrome' | 'firefox' | 'unknown';

export interface DetectBrowserInput {
  userAgent: string;
}

export function detectBrowser(input: DetectBrowserInput): BrowserKind {
  const ua = input.userAgent.toLowerCase();

  if (ua.includes('firefox/')) {
    return 'firefox';
  }

  if (ua.includes('chrome/') || ua.includes('chromium/') || ua.includes('edg/')) {
    return 'chrome';
  }

  return 'unknown';
}

export function supportsRefererInDownload(browser: BrowserKind): boolean {
  return browser === 'firefox';
}
