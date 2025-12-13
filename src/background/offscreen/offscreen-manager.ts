type OffscreenReason = 'preview' | 'thumbnail' | 'trim';

interface OffscreenApi {
  hasDocument?: () => Promise<boolean>;
  createDocument: (request: {
    url: string;
    reasons: string[];
    justification: string;
  }) => Promise<void>;
}

interface RuntimeApi {
  sendMessage: <TResponse>(message: Record<string, unknown>) => Promise<TResponse>;
}

interface OffscreenManagerInput {
  offscreen?: OffscreenApi;
  runtime?: RuntimeApi;
  documentPath?: string;
}

function defaultRuntime(): RuntimeApi {
  return chrome.runtime as unknown as RuntimeApi;
}

function defaultOffscreen(): OffscreenApi | undefined {
  return chrome.offscreen as unknown as OffscreenApi | undefined;
}

function justification(reason: OffscreenReason): string {
  switch (reason) {
    case 'thumbnail':
      return 'Capture direct-media thumbnail frames outside the extension service worker.';
    case 'trim':
      return 'Record browser WebM trim clips outside the extension service worker.';
    case 'preview':
      return 'Render media previews outside the extension service worker.';
  }
}

function reasonForMessage(message: Record<string, unknown>): OffscreenReason {
  if (message.type === 'EXTRACT_THUMBNAIL') {
    return 'thumbnail';
  }

  if (message.type === 'GENERATE_PREVIEW_CLIP' && 'maxDurationSec' in message) {
    return 'trim';
  }

  return 'preview';
}

export function createOffscreenManager(input: OffscreenManagerInput = {}) {
  const offscreen = input.offscreen ?? defaultOffscreen();
  const runtime = input.runtime ?? defaultRuntime();
  const documentPath = input.documentPath ?? 'offscreen.html';

  return {
    async ensure(reason: OffscreenReason): Promise<void> {
      if (!offscreen) {
        throw new Error('Offscreen documents are unavailable in this browser context.');
      }

      if (offscreen.hasDocument && await offscreen.hasDocument()) {
        return;
      }

      await offscreen.createDocument({
        url: documentPath,
        reasons: ['DOM_PARSER'],
        justification: justification(reason),
      });
    },

    async sendMessage<TResponse>(
      message: Record<string, unknown>,
    ): Promise<TResponse> {
      await this.ensure(reasonForMessage(message));
      return runtime.sendMessage<TResponse>(message);
    },
  };
}
