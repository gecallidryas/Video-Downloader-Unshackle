import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HTMLMediaElement jsdom shim', () => {
  test('play, pause, and load do not emit jsdom not-implemented notices', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const video = document.createElement('video');
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onEmptied = vi.fn();

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('emptied', onEmptied);

    await video.play();
    video.pause();
    video.load();

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onEmptied).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
