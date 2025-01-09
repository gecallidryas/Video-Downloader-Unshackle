import type {
  DownloadSelection,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import { isOffscreenCommand, type OffscreenCommand } from '@/src/shared/contracts/offscreen';

export type PreviewHostMessage =
  | {
      type: 'OPEN_PREVIEW';
      candidate: MediaCandidate;
      selection?: DownloadSelection;
    }
  | {
      type: 'CLOSE_PREVIEW';
      candidateId: string;
    };

export interface PreviewHostResponse {
  ok: boolean;
  command?: OffscreenCommand['type'];
}

export interface PreviewHost {
  handleMessage(message: PreviewHostMessage | OffscreenCommand): PreviewHostResponse;
  getCurrentCandidate(): MediaCandidate | undefined;
}

export interface PreviewRuntimeHost {
  onMessage: {
    addListener(
      callback: (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: PreviewHostResponse) => void,
      ) => boolean | void,
    ): void;
  };
}

export function createPreviewHost(): PreviewHost {
  let currentCandidate: MediaCandidate | undefined;

  return {
    handleMessage(message) {
      if (isOffscreenCommand(message)) {
        return { ok: true, command: message.type };
      }

      if (message.type === 'OPEN_PREVIEW') {
        currentCandidate = message.candidate;

        return { ok: true };
      }

      if (currentCandidate?.id === message.candidateId) {
        currentCandidate = undefined;
      }

      return { ok: true };
    },

    getCurrentCandidate() {
      return currentCandidate ? { ...currentCandidate } : undefined;
    },
  };
}

export function registerPreviewHost(
  previewHost: PreviewHost,
  runtime: PreviewRuntimeHost = chrome.runtime,
): void {
  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('type' in message) ||
      (message.type !== 'OPEN_PREVIEW' &&
        message.type !== 'CLOSE_PREVIEW' &&
        !isOffscreenCommand(message))
    ) {
      return undefined;
    }

    sendResponse(previewHost.handleMessage(message as PreviewHostMessage | OffscreenCommand));

    return false;
  });
}
