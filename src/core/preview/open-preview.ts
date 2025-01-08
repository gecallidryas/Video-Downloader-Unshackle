import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import type { PreviewHostMessage } from '@/src/offscreen/preview-host';

export interface OpenPreviewResult {
  ok: boolean;
}

export interface OffscreenPreviewDocumentRequest {
  path: string;
  reasons: ['DOM_PARSER'];
  justification: string;
}

export interface OpenPreviewDependencies {
  ensureOffscreenDocument: (
    request: OffscreenPreviewDocumentRequest,
  ) => Promise<void>;
  sendPreviewMessage: (message: PreviewHostMessage) => Promise<OpenPreviewResult>;
}

export const offscreenPreviewDocumentRequest: OffscreenPreviewDocumentRequest = {
  path: 'offscreen.html',
  reasons: ['DOM_PARSER'],
  justification: 'Render media previews outside the extension service worker.',
};

interface ChromePreviewApis {
  offscreen?: {
    hasDocument?: () => Promise<boolean>;
    createDocument: (request: {
      url: string;
      reasons: string[];
      justification: string;
    }) => Promise<void>;
  };
  runtime: {
    sendMessage: (message: PreviewHostMessage) => Promise<OpenPreviewResult>;
  };
}

function getChromePreviewApis(): ChromePreviewApis {
  return chrome as unknown as ChromePreviewApis;
}

async function ensureChromeOffscreenDocument(
  request: OffscreenPreviewDocumentRequest,
): Promise<void> {
  const chromeApis = getChromePreviewApis();

  if (!chromeApis.offscreen) {
    return;
  }

  if (chromeApis.offscreen.hasDocument && await chromeApis.offscreen.hasDocument()) {
    return;
  }

  await chromeApis.offscreen.createDocument({
    url: request.path,
    reasons: request.reasons,
    justification: request.justification,
  });
}

async function sendChromePreviewMessage(
  message: PreviewHostMessage,
): Promise<OpenPreviewResult> {
  return getChromePreviewApis().runtime.sendMessage(message);
}

export async function openPreview(
  candidate: MediaCandidate,
  dependencies: OpenPreviewDependencies = {
    ensureOffscreenDocument: ensureChromeOffscreenDocument,
    sendPreviewMessage: sendChromePreviewMessage,
  },
): Promise<OpenPreviewResult> {
  await dependencies.ensureOffscreenDocument(offscreenPreviewDocumentRequest);

  return dependencies.sendPreviewMessage({
    type: 'OPEN_PREVIEW',
    candidate,
  });
}
