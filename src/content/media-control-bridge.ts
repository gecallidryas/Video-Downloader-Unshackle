export type MediaControlCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle-pip' }
  | { type: 'screenshot' }
  | { type: 'seek'; deltaSeconds: number };

export interface MediaControlBridge {
  send(command: MediaControlCommand): Promise<void>;
}

export interface MediaControlBridgeOptions {
  dispatch?: (command: MediaControlCommand) => Promise<void>;
}

export interface MediaControlRuntime {
  onMessage?: {
    addListener(
      callback: (
        message: unknown,
        sender: unknown,
        sendResponse: (response: unknown) => void,
      ) => boolean | undefined,
    ): void;
  };
}

function findPageMedia(root: Document): HTMLMediaElement | null {
  return root.querySelector('video, audio');
}

async function requestPictureInPicture(media: HTMLMediaElement): Promise<void> {
  if (!(media instanceof HTMLVideoElement)) {
    return;
  }
  const documentWithPip = document as Document & {
    pictureInPictureElement?: Element | null;
    exitPictureInPicture?: () => Promise<void>;
  };
  if (documentWithPip.pictureInPictureElement && documentWithPip.exitPictureInPicture) {
    await documentWithPip.exitPictureInPicture();
    return;
  }
  const video = media as HTMLVideoElement & {
    requestPictureInPicture?: () => Promise<void>;
  };
  await video.requestPictureInPicture?.();
}

function captureScreenshot(media: HTMLMediaElement): void {
  if (!(media instanceof HTMLVideoElement)) {
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = media.videoWidth || media.clientWidth || 1;
  canvas.height = media.videoHeight || media.clientHeight || 1;
  const context = canvas.getContext('2d');
  context?.drawImage(media, 0, 0, canvas.width, canvas.height);
}

export async function executeMediaControlCommand(
  root: Document,
  command: MediaControlCommand,
): Promise<void> {
  const media = findPageMedia(root);
  if (!media) {
    return;
  }

  switch (command.type) {
    case 'play':
      await media.play();
      break;
    case 'pause':
      media.pause();
      break;
    case 'toggle-pip':
      await requestPictureInPicture(media);
      break;
    case 'screenshot':
      captureScreenshot(media);
      break;
    case 'seek':
      media.currentTime = Math.max(0, media.currentTime + command.deltaSeconds);
      break;
  }
}

function isMediaControlMessage(
  message: unknown,
): message is { type: 'media-control'; command: MediaControlCommand } {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const candidate = message as { type?: unknown; command?: { type?: unknown } };
  return (
    candidate.type === 'media-control' &&
    typeof candidate.command === 'object' &&
    candidate.command !== null &&
    typeof candidate.command.type === 'string'
  );
}

export function registerMediaControlListener(
  runtime: MediaControlRuntime | undefined =
    typeof chrome !== 'undefined' ? chrome.runtime : undefined,
  root: Document = document,
): void {
  runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (!isMediaControlMessage(message)) {
      return undefined;
    }

    void executeMediaControlCommand(root, message.command)
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Media control failed',
        });
      });

    return true;
  });
}

export function createMediaControlBridge(
  options: MediaControlBridgeOptions = {},
): MediaControlBridge {
  return {
    async send(command) {
      if (options.dispatch) {
        await options.dispatch(command);
        return;
      }
      const runtime = globalThis.chrome?.runtime;
      if (runtime?.sendMessage) {
        await runtime.sendMessage({ type: 'media-control', command });
      }
    },
  };
}
