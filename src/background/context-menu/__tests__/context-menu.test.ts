import { describe, expect, test, vi } from 'vitest';
import { createContextMenuManager } from '../context-menu';

describe('context menu manager', () => {
  test('registers menus only when enabled by settings', async () => {
    const contextMenus = {
      create: vi.fn((item: { id: string }) => item.id),
      removeAll: vi.fn((callback?: () => void) => callback?.()),
      onClicked: { addListener: vi.fn() },
    };
    const disabled = createContextMenuManager({
      contextMenus,
      getSettings: () => ({ enableContextMenu: false }),
      startDownload: vi.fn(),
    });

    await disabled.register();
    expect(contextMenus.create).not.toHaveBeenCalled();

    const enabled = createContextMenuManager({
      contextMenus,
      getSettings: () => ({ enableContextMenu: true }),
      startDownload: vi.fn(),
    });
    await enabled.register();

    expect(contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'unshackle-download-video' }),
    );
    expect(contextMenus.onClicked.addListener).toHaveBeenCalled();
  });

  test('starts only policy-allowed context downloads', async () => {
    const startDownload = vi.fn();
    const manager = createContextMenuManager({
      contextMenus: {
        create: vi.fn(),
        removeAll: vi.fn((callback?: () => void) => callback?.()),
        onClicked: { addListener: vi.fn() },
      },
      getSettings: () => ({ enableContextMenu: true }),
      startDownload,
    });

    await manager.handleClick(
      {
        menuItemId: 'unshackle-download-video',
        srcUrl: 'https://cdn.example.com/video.mp4',
        pageUrl: 'https://example.com/watch',
        editable: false,
      },
      { id: 7, title: 'Example', url: 'https://example.com/watch' } as chrome.tabs.Tab,
    );
    await manager.handleClick(
      {
        menuItemId: 'unshackle-download-video',
        srcUrl: 'blob:https://example.com/protected',
        pageUrl: 'https://example.com/watch',
        editable: false,
      },
      { id: 7, title: 'Example', url: 'https://example.com/watch' } as chrome.tabs.Tab,
    );

    expect(startDownload).toHaveBeenCalledTimes(1);
    expect(startDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'direct',
        sourceUrl: 'https://cdn.example.com/video.mp4',
        status: 'ready',
      }),
    );
  });
});
