import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  executeMediaControlCommand,
  registerMediaControlListener,
} from '../media-control-bridge';

describe('media control bridge content receiver', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  test('play and seek commands act on the first page media element', async () => {
    const video = document.createElement('video');
    video.currentTime = 25;
    video.play = vi.fn(async () => undefined);
    document.body.append(video);

    await executeMediaControlCommand(document, { type: 'play' });
    await executeMediaControlCommand(document, { type: 'seek', deltaSeconds: 10 });

    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(35);
  });

  test('registers runtime listener for media-control messages', async () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'pause', {
      configurable: true,
      value: vi.fn(),
    });
    document.body.append(video);
    const addListener = vi.fn();

    registerMediaControlListener({ onMessage: { addListener } }, document);

    const listener = addListener.mock.calls[0][0] as (
      message: unknown,
      sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => boolean | undefined;
    const sendResponse = vi.fn();
    const keepAlive = listener(
      { type: 'media-control', command: { type: 'pause' } },
      {},
      sendResponse,
    );
    await Promise.resolve();

    expect(keepAlive).toBe(true);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });
});
