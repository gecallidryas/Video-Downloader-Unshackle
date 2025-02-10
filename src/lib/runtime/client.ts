import type {
  DetectionEvidence,
  DownloadJob,
  DownloadSelection,
  GeneratedAssetResult,
  MediaCandidate,
  PreviewAssetFormat,
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
  requestHostAccess(origin: string): Promise<{ granted: boolean; origin: string }>;
  getDebugEvidence(candidateId: string): Promise<DetectionEvidence[]>;
  getPreviewAsset(candidateId: string, options?: { format?: PreviewAssetFormat }): Promise<GeneratedAssetResult>;
  getThumbnailAsset(candidateId: string): Promise<GeneratedAssetResult>;
  startDownload(candidateId: string, selection: DownloadSelection): Promise<DownloadJob>;
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

    async requestHostAccess(origin) {
      const response = await transport(
        createRuntimeRequest('REQUEST_HOST_ACCESS', { origin }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(
          response.payload.message,
          response.payload.code,
          response.payload.detail,
        );
      }

      if (response.type !== 'REQUEST_HOST_ACCESS_RESULT') {
        throw new RuntimeClientError(
          `Unexpected runtime response: ${response.type}`,
          'UNEXPECTED_RESPONSE',
        );
      }

      return response.payload;
    },

    async getDebugEvidence(candidateId) {
      const response = await transport(
        createRuntimeRequest('DEBUG_GET_EVIDENCE', { candidateId }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(
          response.payload.message,
          response.payload.code,
          response.payload.detail,
        );
      }

      if (response.type !== 'DEBUG_GET_EVIDENCE_RESULT') {
        throw new RuntimeClientError(
          `Unexpected runtime response: ${response.type}`,
          'UNEXPECTED_RESPONSE',
        );
      }

      return response.payload.evidence;
    },

    async getPreviewAsset(candidateId, options = {}) {
      const response = await transport(
        createRuntimeRequest('GET_PREVIEW_ASSET', {
          candidateId,
          ...(options.format ? { format: options.format } : {}),
        }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(
          response.payload.message,
          response.payload.code,
          response.payload.detail,
        );
      }

      if (response.type !== 'GET_PREVIEW_ASSET_RESULT') {
        throw new RuntimeClientError(
          `Unexpected runtime response: ${response.type}`,
          'UNEXPECTED_RESPONSE',
        );
      }

      return response.payload;
    },

    async getThumbnailAsset(candidateId) {
      const response = await transport(
        createRuntimeRequest('GET_THUMBNAIL_ASSET', { candidateId }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(
          response.payload.message,
          response.payload.code,
          response.payload.detail,
        );
      }

      if (response.type !== 'GET_THUMBNAIL_ASSET_RESULT') {
        throw new RuntimeClientError(
          `Unexpected runtime response: ${response.type}`,
          'UNEXPECTED_RESPONSE',
        );
      }

      return response.payload;
    },

    async startDownload(candidateId, selection) {
      const response = await transport(
        createRuntimeRequest('START_DOWNLOAD', { candidateId, selection }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(
          response.payload.message,
          response.payload.code,
          response.payload.detail,
        );
      }

      if (response.type !== 'START_DOWNLOAD_RESULT') {
        throw new RuntimeClientError(
          `Unexpected runtime response: ${response.type}`,
          'UNEXPECTED_RESPONSE',
        );
      }

      return response.payload.job;
    },
  };
}
