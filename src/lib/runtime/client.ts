import type {
  MediaCandidate,
  QueueStats,
  RuntimeRequest,
  RuntimeResponse,
} from '@/video_downloader_types_skeleton';
import { createRuntimeRequest } from '@/src/shared/contracts/messages';
import { isRuntimeErrorResponse } from '@/src/shared/contracts/runtime';

type RuntimeTransport = (message: RuntimeRequest) => Promise<RuntimeResponse>;

export class RuntimeClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'RuntimeClientError';
  }
}

export interface RuntimeClient {
  getCandidates(tabId: number): Promise<MediaCandidate[]>;
  getQueueStats(): Promise<QueueStats>;
}

async function defaultTransport(
  message: RuntimeRequest,
): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(message) as Promise<RuntimeResponse>;
}

export function createRuntimeClient(
  transport: RuntimeTransport = defaultTransport,
): RuntimeClient {
  return {
    async getCandidates(tabId) {
      const response = await transport(
        createRuntimeRequest('GET_CANDIDATES', { tabId }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(
          response.payload.message,
          response.payload.code,
          response.payload.detail,
        );
      }

      if (response.type !== 'GET_CANDIDATES_RESULT') {
        throw new RuntimeClientError(
          `Unexpected runtime response: ${response.type}`,
          'UNEXPECTED_RESPONSE',
        );
      }

      return response.payload.candidates;
    },

    async getQueueStats() {
      const response = await transport(createRuntimeRequest('GET_QUEUE_STATS', {}));

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(
          response.payload.message,
          response.payload.code,
          response.payload.detail,
        );
      }

      if (response.type !== 'GET_QUEUE_STATS_RESULT') {
        throw new RuntimeClientError(
          `Unexpected runtime response: ${response.type}`,
          'UNEXPECTED_RESPONSE',
        );
      }

      return response.payload.stats;
    },
  };
}
