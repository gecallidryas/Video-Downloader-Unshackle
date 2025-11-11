import { describe, expect, test, vi } from 'vitest';
import { getSelectedLinks } from '@/src/content/dom/collect-page-context';
import { createContextMenuManager } from '../context-menu';

describe('selected link context menu ingest', () => {
  test('extracts hrefs from selected anchor elements', () => {
    document.body.innerHTML = `
      <a href="https://cdn.example/video1.m3u8">Link 1</a>
      <a href="https://cdn.example/video2.mp4">Link 2</a>
      <span>Not a link</span>
    `;

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(document.body);
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(getSelectedLinks()).toEqual([
      'https://cdn.example/video1.m3u8',
      'https://cdn.example/video2.mp4',
    ]);
  });

  test('runs selected-link extractor and ingests returned links', async () => {
    const ingestCandidate = vi.fn();
    const manager = createContextMenuManager({
      contextMenus: {
        create: vi.fn(),
        removeAll: vi.fn((callback?: () => void) => callback?.()),
        onClicked: { addListener: vi.fn() },
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([
          {
            result: [
              'https://cdn.example/master.m3u8',
              'https://cdn.example/movie.mp4',
            ],
          },
        ]),
      },
      getSettings: () => ({ enableContextMenu: true }),
      startDownload: vi.fn(),
      ingestCandidate,
      now: () => 1234,
    });

    await manager.handleClick(
      {
        menuItemId: 'unshackle-extract-selected-links',
        editable: false,
      },
      { id: 7, title: 'Example', url: 'https://example.com/watch' } as chrome.tabs.Tab,
    );

    expect(ingestCandidate).toHaveBeenCalledTimes(2);
    expect(ingestCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'hls',
        manifestUrl: 'https://cdn.example/master.m3u8',
        status: 'ready',
        evidence: [
          expect.objectContaining({
            source: 'user',
            url: 'https://cdn.example/master.m3u8',
          }),
        ],
      }),
    );
  });

  test('manual HLS ingest creates a candidate from selected URL text', async () => {
    const ingestCandidate = vi.fn();
    const manager = createContextMenuManager({
      contextMenus: {
        create: vi.fn(),
        removeAll: vi.fn((callback?: () => void) => callback?.()),
        onClicked: { addListener: vi.fn() },
      },
      getSettings: () => ({ enableContextMenu: true }),
      startDownload: vi.fn(),
      ingestCandidate,
      now: () => 4321,
    });

    await manager.handleClick(
      {
        menuItemId: 'unshackle-ingest-hls-url',
        selectionText: 'Watch https://cdn.example/live/master.m3u8?token=abc now',
        editable: false,
      },
      { id: 9, title: 'Live', url: 'https://example.com/live' } as chrome.tabs.Tab,
    );

    expect(ingestCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'context-4321',
        tabId: 9,
        protocol: 'hls',
        manifestUrl: 'https://cdn.example/live/master.m3u8?token=abc',
        pageUrl: 'https://example.com/live',
        displayName: 'Live',
      }),
    );
  });
});
