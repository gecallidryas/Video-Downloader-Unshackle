type OffscreenReason = 'preview' | 'thumbnail' | 'trim' | 'export';

interface OffscreenApi {
  hasDocument?: () => Promise<boolean>;
  createDocument: (request: {
    url: string;
    reasons: string[];
    justification: string;
  }) => Promise<void>;
}

interface RuntimeApi {
  sendMessage: <TResponse>(message: unknown) => Promise<TResponse>;
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
    case 'export':
      return 'Export browser-only HLS media outside the extension service worker.';
  }
}

function reasonForMessage(message: unknown): OffscreenReason {
  const typedMessage = typeof message === 'object' && message !== null
    ? message as Record<string, unknown>
    : {};

  if (typedMessage.type === 'EXTRACT_THUMBNAIL') {
    return 'thumbnail';
  }

  if (typedMessage.type === 'GENERATE_PREVIEW_CLIP' && 'maxDurationSec' in typedMessage) {
    return 'trim';
  }

  if (typeof typedMessage.type === 'string' && typedMessage.type.includes('BROWSER_HLS')) {
    return 'export';
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
        reasons: ['DOM_SCRAPING', 'BLOBS'],
        justification: justification(reason),
      });
    },

    async sendMessage<TResponse>(
      message: Record<string, unknown> | object,
    ): Promise<TResponse> {
      await this.ensure(reasonForMessage(message));
      return runtime.sendMessage<TResponse>(message);
    },
  };
}
