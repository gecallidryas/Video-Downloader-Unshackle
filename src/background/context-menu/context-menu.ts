import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { getCandidateActionPolicy } from '@/src/core/policy/action-policy';

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

export interface ContextMenuManagerOptions {
  contextMenus?: ContextMenusLike;
  getSettings: () => ContextMenuSettings;
  startDownload: (candidate: MediaCandidate) => void | Promise<void>;
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

export function createContextMenuManager(options: ContextMenuManagerOptions) {
  const contextMenus = options.contextMenus ?? chrome.contextMenus;
  const now = options.now ?? Date.now;

  async function register(): Promise<void> {
    await new Promise<void>((resolve) => contextMenus.removeAll(resolve));

    if (!options.getSettings().enableContextMenu) {
      return;
    }

    contextMenus.create({
      id: 'unshackle-parent',
      title: 'Unshackle Video',
      contexts: ['video', 'link', 'page'],
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
    contextMenus.onClicked.addListener((info, tab) => {
      void handleClick(info, tab);
    });
  }

  async function handleClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab,
  ): Promise<void> {
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
  };
}
