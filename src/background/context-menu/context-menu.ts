import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { getCandidateActionPolicy } from '@/src/core/policy/action-policy';
import { getSelectedLinks } from '@/src/content/dom/collect-page-context';

export interface ContextMenuSettings {
  enableContextMenu: boolean;
}

export interface ContextMenusLike {
  create(item: chrome.contextMenus.CreateProperties): string | number | undefined;
  removeAll(callback?: () => void): void;
  onClicked: {
    addListener(
      callback: (
        info: chrome.contextMenus.OnClickData,
        tab?: chrome.tabs.Tab,
      ) => void,
    ): void;
  };
}

export interface ScriptingLike {
  executeScript(injection: {
    target: { tabId: number };
    func: () => string[];
  }): Promise<Array<{ result?: unknown }>>;
}

export interface ContextMenuManagerOptions {
  contextMenus?: ContextMenusLike;
  scripting?: ScriptingLike;
  getSettings: () => ContextMenuSettings;
  startDownload: (candidate: MediaCandidate) => void | Promise<void>;
  ingestCandidate?: (candidate: MediaCandidate) => void | Promise<void>;
  now?: () => number;
}

function protocolFromUrl(url: string): MediaCandidate['protocol'] {
  const lower = url.toLowerCase();

  if (lower.includes('.m3u8')) {
    return 'hls';
  }

  if (lower.includes('.mpd')) {
    return 'dash';
  }

  return 'direct';
}

function originFromUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function candidateFromContextUrl(
  url: string,
  tab: chrome.tabs.Tab | undefined,
  now: number,
): MediaCandidate {
  const protocol = protocolFromUrl(url);

  return {
    id: `context-${now}`,
    tabId: tab?.id ?? -1,
    mediaKind: 'video',
    protocol,
    status: url.startsWith('blob:') ? 'unsupported' : 'ready',
    pageUrl: tab?.url ?? url,
    pageTitle: tab?.title,
    origin: originFromUrl(tab?.url ?? url),
    displayName: tab?.title ?? 'Context video',
    ...(protocol === 'direct' ? { sourceUrl: url } : { manifestUrl: url }),
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [
      {
        source: 'user',
        confidence: 0.8,
        url,
        initiatorUrl: tab?.url,
        createdAt: now,
      },
    ],
    preview: { playable: protocol === 'direct', adapter: protocol === 'direct' ? 'native' : 'none' },
    createdAt: now,
    updatedAt: now,
  };
}

function firstUrlFromText(value: string): string | undefined {
  return value.match(/https?:\/\/[^\s"'<>]+/)?.[0]?.replace(/[),.;\]}]+$/, '');
}

function isHlsUrl(value: string): boolean {
  try {
    return new URL(value).pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    return value.toLowerCase().includes('.m3u8');
  }
}

export function createContextMenuManager(options: ContextMenuManagerOptions) {
  const contextMenus = options.contextMenus ?? chrome.contextMenus;
  const scripting = options.scripting ?? chrome.scripting;
  const now = options.now ?? Date.now;
  const ingestCandidate = options.ingestCandidate ?? options.startDownload;

  async function register(): Promise<void> {
    await new Promise<void>((resolve) => contextMenus.removeAll(resolve));

    if (!options.getSettings().enableContextMenu) {
      return;
    }

    contextMenus.create({
      id: 'unshackle-parent',
      title: 'Unshackle Video',
      contexts: ['video', 'link', 'page', 'selection'],
    });
    contextMenus.create({
      id: 'unshackle-download-video',
      parentId: 'unshackle-parent',
      title: 'Download This Video',
      contexts: ['video'],
    });
    contextMenus.create({
      id: 'unshackle-download-link',
      parentId: 'unshackle-parent',
      title: 'Download Video Link',
      contexts: ['link'],
    });
    contextMenus.create({
      id: 'unshackle-scan-page',
      parentId: 'unshackle-parent',
      title: 'Scan Page for Videos',
      contexts: ['page'],
    });
    contextMenus.create({
      id: 'unshackle-extract-selected-links',
      parentId: 'unshackle-parent',
      title: 'Extract Selected Links',
      contexts: ['selection'],
    });
    contextMenus.create({
      id: 'unshackle-ingest-hls-url',
      parentId: 'unshackle-parent',
      title: 'Ingest HLS URL',
      contexts: ['selection', 'link'],
    });
    contextMenus.onClicked.addListener((info, tab) => {
      void handleClick(info, tab);
    });
  }

  async function ingestUrl(url: string, tab: chrome.tabs.Tab | undefined): Promise<void> {
    const candidate = candidateFromContextUrl(url, tab, now());

    await ingestCandidate(candidate);
  }

  async function ingestHlsUrl(
    urlText: string,
    tab?: chrome.tabs.Tab,
  ): Promise<MediaCandidate | undefined> {
    const url = firstUrlFromText(urlText.trim()) ?? urlText.trim();

    if (!url || !isHlsUrl(url)) {
      return undefined;
    }

    const candidate = candidateFromContextUrl(url, tab, now());
    await ingestCandidate(candidate);

    return candidate;
  }

  async function handleSelectedLinks(tab: chrome.tabs.Tab | undefined): Promise<void> {
    if (tab?.id === undefined) {
      return;
    }

    const results = await scripting.executeScript({
      target: { tabId: tab.id },
      func: getSelectedLinks,
    });
    const links = results.flatMap((item) =>
      Array.isArray(item.result)
        ? item.result.filter((url): url is string => typeof url === 'string')
        : [],
    );

    await Promise.all(links.map((url) => ingestUrl(url, tab)));
  }

  async function handleClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab,
  ): Promise<void> {
    if (info.menuItemId === 'unshackle-extract-selected-links') {
      await handleSelectedLinks(tab);
      return;
    }

    if (info.menuItemId === 'unshackle-ingest-hls-url') {
      await ingestHlsUrl(info.selectionText ?? info.linkUrl ?? '', tab);
      return;
    }

    if (
      info.menuItemId !== 'unshackle-download-video' &&
      info.menuItemId !== 'unshackle-download-link'
    ) {
      return;
    }

    const url = info.srcUrl ?? info.linkUrl;

    if (!url) {
      return;
    }

    const candidate = candidateFromContextUrl(url, tab, now());
    const policy = getCandidateActionPolicy(candidate);

    if (!policy.canDownload) {
      return;
    }

    await options.startDownload(candidate);
  }

  return {
    register,
    handleClick,
    ingestHlsUrl,
  };
}
