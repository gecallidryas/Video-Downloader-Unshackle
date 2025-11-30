import type {
  DownloadSelection,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import { isOffscreenCommand, type OffscreenCommand } from '@/src/shared/contracts/offscreen';
import { captureVideoFrame } from './capture-video-frame';
import { recordPreviewClip } from './record-preview-clip';

export type PreviewHostMessage =
  | {
      type: 'OPEN_PREVIEW';
      candidate: MediaCandidate;
      selection?: DownloadSelection;
    }
  | {
      type: 'CLOSE_PREVIEW';
      candidateId: string;
    }
  | {
      type: 'EXTRACT_THUMBNAIL';
      url: string;
      atSec: number;
      format: 'jpeg' | 'png' | 'webp';
    }
  | {
      type: 'GENERATE_PREVIEW_CLIP';
      url: string;
      startSec: number;
      durationSec: number;
      maxDurationSec?: number;
    };

export interface PreviewHostResponse {
  ok: boolean;
  command?: OffscreenCommand['type'];
  assetUrl?: string;
  mimeType?: string;
}

export interface PreviewHost {
  handleMessage(message: PreviewHostMessage | OffscreenCommand): PreviewHostResponse | Promise<PreviewHostResponse>;
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

      if (message.type === 'EXTRACT_THUMBNAIL') {
        return captureVideoFrame({
          url: message.url,
          atSec: message.atSec,
          format: message.format,
          timeoutMs: 10_000,
        }).then((dataUrl) => ({
          ok: true,
          assetUrl: dataUrl,
          mimeType: `image/${message.format}`,
        }));
      }

      if (message.type === 'GENERATE_PREVIEW_CLIP') {
        return recordPreviewClip({
          url: message.url,
          startSec: message.startSec,
          durationSec: message.durationSec,
          maxDurationSec: message.maxDurationSec,
          timeoutMs: 15_000,
        }).then((clip) => ({
          ok: true,
          assetUrl: clip.dataUrl,
          mimeType: clip.mimeType,
        }));
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

const PREVIEW_HOST_MESSAGE_TYPES = new Set([
  'OPEN_PREVIEW',
  'CLOSE_PREVIEW',
  'EXTRACT_THUMBNAIL',
  'GENERATE_PREVIEW_CLIP',
]);

export function registerPreviewHost(
  previewHost: PreviewHost,
  runtime: PreviewRuntimeHost = chrome.runtime,
): void {
  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('type' in message) ||
      (!PREVIEW_HOST_MESSAGE_TYPES.has((message as { type: string }).type) &&
        !isOffscreenCommand(message))
    ) {
      return undefined;
    }

    const result = previewHost.handleMessage(message as PreviewHostMessage | OffscreenCommand);

    if (result instanceof Promise) {
      void result.then(sendResponse);
      return true;
    }

    sendResponse(result);

    return false;
  });
}
