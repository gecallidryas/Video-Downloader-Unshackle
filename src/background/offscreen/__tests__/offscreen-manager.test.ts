import { describe, expect, test, vi } from 'vitest';
import { createOffscreenManager } from '../offscreen-manager';

function runtime() {
  return {
    sendMessage: vi.fn().mockResolvedValue({ ok: true }),
  };
}

function offscreen(hasDocument: boolean) {
  return {
    hasDocument: vi.fn().mockResolvedValue(hasDocument),
    createDocument: vi.fn().mockResolvedValue(undefined),
  };
}

describe('offscreen manager', () => {
  test('ensures an offscreen document exists before preview clip messages', async () => {
    const chromeOffscreen = offscreen(false);
    const chromeRuntime = runtime();
    const manager = createOffscreenManager({
      offscreen: chromeOffscreen,
      runtime: chromeRuntime,
    });

    await expect(
      manager.sendMessage({ type: 'GENERATE_PREVIEW_CLIP', url: 'https://cdn.example.com/v.mp4' }),
    ).resolves.toEqual({ ok: true });

    expect(chromeOffscreen.createDocument).toHaveBeenCalledWith({
      url: 'offscreen.html',
      reasons: ['DOM_SCRAPING', 'BLOBS'],
      justification: expect.stringMatching(/preview/i),
    });
    expect(chromeRuntime.sendMessage).toHaveBeenCalledWith({
      type: 'GENERATE_PREVIEW_CLIP',
      url: 'https://cdn.example.com/v.mp4',
    });
  });

  test('ensures an offscreen document exists before thumbnail messages', async () => {
    const chromeOffscreen = offscreen(false);
    const chromeRuntime = runtime();
    const manager = createOffscreenManager({
      offscreen: chromeOffscreen,
      runtime: chromeRuntime,
    });

    await manager.sendMessage({ type: 'EXTRACT_THUMBNAIL', url: 'https://cdn.example.com/v.mp4' });

    expect(chromeOffscreen.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'offscreen.html',
        reasons: ['DOM_SCRAPING', 'BLOBS'],
        justification: expect.stringMatching(/thumbnail/i),
      }),
    );
  });

  test('uses export justification for browser HLS append messages', async () => {
    const chromeOffscreen = offscreen(false);
    const manager = createOffscreenManager({
      offscreen: chromeOffscreen,
      runtime: runtime(),
    });

    await manager.sendMessage({
      type: 'APPEND_BROWSER_HLS_SEGMENT',
      payload: { jobId: 'job-1' },
    });

    expect(chromeOffscreen.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        justification: expect.stringMatching(/export/i),
      }),
    );
  });

  test('reuses an existing offscreen document', async () => {
    const chromeOffscreen = offscreen(true);
    const manager = createOffscreenManager({
      offscreen: chromeOffscreen,
      runtime: runtime(),
    });

    await manager.ensure('trim');

    expect(chromeOffscreen.createDocument).not.toHaveBeenCalled();
  });

  test('returns a clear error when chrome.offscreen is unavailable', async () => {
    const manager = createOffscreenManager({
      runtime: runtime(),
    });

    await expect(manager.ensure('preview')).rejects.toThrow(
      'Offscreen documents are unavailable in this browser context.',
    );
  });
});
