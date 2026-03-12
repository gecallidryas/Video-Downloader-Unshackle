import type {
  DetectionEvidence,
  DownloadJob,
  DownloadSelection,
  GeneratedAssetResult,
  MediaAssetKind,
  MediaAssetPriority,
  MediaAssetState,
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
  getAllCandidates(): Promise<MediaCandidate[]>;
  getJobs(): Promise<DownloadJob[]>;
  ingestManualHls(input: {
    tabId: number;
    pageUrl: string;
    pageTitle?: string;
    input: string;
    baseUrl?: string;
  }): Promise<MediaCandidate[]>;
  getQueueStats(): Promise<QueueStats>;
  requestHostAccess(origin: string): Promise<{ granted: boolean; origin: string }>;
  getDebugEvidence(candidateId: string): Promise<DetectionEvidence[]>;
  getPreviewAsset(candidateId: string, options?: { format?: PreviewAssetFormat }): Promise<GeneratedAssetResult>;
  getThumbnailAsset(candidateId: string): Promise<GeneratedAssetResult>;
  getMediaAssetState(candidateId: string): Promise<MediaAssetState[]>;
  queueMediaAsset(
    candidateId: string,
    kind: MediaAssetKind,
    options?: { priority?: MediaAssetPriority },
  ): Promise<MediaAssetState>;
  startDownload(candidateId: string, selection: DownloadSelection): Promise<DownloadJob>;
  cancelDownload(jobId: string): Promise<{ cancelled: boolean; downloadId?: number }>;
  retrySegment(jobId: string, segmentIndex: number): Promise<DownloadJob | undefined>;
  retryFailedSegments(jobId: string): Promise<DownloadJob | undefined>;
  exportPartialHls(jobId: string, range: { start: number; end: number }): Promise<DownloadJob | undefined>;
  updateHlsSegmentRange(jobId: string, range: { start: number; end: number }): Promise<DownloadJob | undefined>;
  recoverHlsExport(
    jobId: string,
    action: 'save_raw_ts' | 'retry_mp4_conversion',
  ): Promise<DownloadJob | undefined>;
  replaceHlsManifestUrl(jobId: string, manifestUrl: string): Promise<DownloadJob | undefined>;
  retryDownload(jobId: string): Promise<DownloadJob | undefined>;
  resaveDownload(jobId: string): Promise<DownloadJob | undefined>;
  removeDownload(jobId: string): Promise<boolean>;
  clearCompletedDownloads(): Promise<string[]>;
  pauseAllDownloads(): Promise<string[]>;
  ingestDirectUrl(input: {
    tabId: number;
    url: string;
    filename?: string;
    referer?: string;
    origin?: string;
  }): Promise<DownloadJob | undefined>;
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

    async ingestManualHls(input) {
      const response = await transport(
        createRuntimeRequest('INGEST_MANUAL_HLS', input),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(
          response.payload.message,
          response.payload.code,
          response.payload.detail,
        );
      }

      if (response.type !== 'INGEST_MANUAL_HLS_RESULT') {
        throw new RuntimeClientError(
          `Unexpected runtime response: ${response.type}`,
          'UNEXPECTED_RESPONSE',
        );
      }

      return response.payload.candidates;
    },

    async getAllCandidates() {
      const response = await transport(createRuntimeRequest('GET_ALL_CANDIDATES', {}));

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }

      if (response.type !== 'GET_ALL_CANDIDATES_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }

      return response.payload.candidates;
    },

    async getJobs() {
      const response = await transport(createRuntimeRequest('GET_JOBS', {}));

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }

      if (response.type !== 'GET_JOBS_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }

      return response.payload.jobs;
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

    async getMediaAssetState(candidateId) {
      const response = await transport(
        createRuntimeRequest('GET_MEDIA_ASSET_STATE', { candidateId }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(
          response.payload.message,
          response.payload.code,
          response.payload.detail,
        );
      }

      if (response.type !== 'GET_MEDIA_ASSET_STATE_RESULT') {
        throw new RuntimeClientError(
          `Unexpected runtime response: ${response.type}`,
          'UNEXPECTED_RESPONSE',
        );
      }

      return response.payload.states;
    },

    async queueMediaAsset(candidateId, kind, options = {}) {
      const response = await transport(
        createRuntimeRequest('QUEUE_MEDIA_ASSET', {
          candidateId,
          kind,
          ...(options.priority ? { priority: options.priority } : {}),
        }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(
          response.payload.message,
          response.payload.code,
          response.payload.detail,
        );
      }

      if (response.type !== 'QUEUE_MEDIA_ASSET_RESULT') {
        throw new RuntimeClientError(
          `Unexpected runtime response: ${response.type}`,
          'UNEXPECTED_RESPONSE',
        );
      }

      return response.payload.state;
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

    async cancelDownload(jobId) {
      const response = await transport(
        createRuntimeRequest('CANCEL_DOWNLOAD', { jobId }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(
          response.payload.message,
          response.payload.code,
          response.payload.detail,
        );
      }

      if (response.type !== 'CANCEL_DOWNLOAD_RESULT') {
        throw new RuntimeClientError(
          `Unexpected runtime response: ${response.type}`,
          'UNEXPECTED_RESPONSE',
        );
      }

      return response.payload;
    },

    async retrySegment(jobId, segmentIndex) {
      const response = await transport(
        createRuntimeRequest('RETRY_HLS_SEGMENT', { jobId, segmentIndex }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }

      if (response.type !== 'RETRY_HLS_SEGMENT_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }

      return response.payload.job;
    },

    async retryFailedSegments(jobId) {
      const response = await transport(
        createRuntimeRequest('RETRY_FAILED_HLS_SEGMENTS', { jobId }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }

      if (response.type !== 'RETRY_FAILED_HLS_SEGMENTS_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }

      return response.payload.job;
    },

    async exportPartialHls(jobId, range) {
      const response = await transport(
        createRuntimeRequest('EXPORT_PARTIAL_HLS', { jobId, range }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }

      if (response.type !== 'EXPORT_PARTIAL_HLS_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }

      return response.payload.job;
    },

    async updateHlsSegmentRange(jobId, range) {
      const response = await transport(
        createRuntimeRequest('UPDATE_HLS_SEGMENT_RANGE', { jobId, range }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }

      if (response.type !== 'UPDATE_HLS_SEGMENT_RANGE_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }

      return response.payload.job;
    },

    async recoverHlsExport(jobId, action) {
      const response = await transport(
        createRuntimeRequest('RECOVER_HLS_EXPORT', { jobId, action }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }

      if (response.type !== 'RECOVER_HLS_EXPORT_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }

      return response.payload.job;
    },

    async replaceHlsManifestUrl(jobId, manifestUrl) {
      const response = await transport(
        createRuntimeRequest('REPLACE_HLS_MANIFEST_URL', { jobId, manifestUrl }),
      );

      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }

      if (response.type !== 'REPLACE_HLS_MANIFEST_URL_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }

      return response.payload.job;
    },

    async retryDownload(jobId) {
      const response = await transport(createRuntimeRequest('RETRY_DOWNLOAD', { jobId }));
      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }
      if (response.type !== 'RETRY_DOWNLOAD_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }
      return response.payload.job;
    },

    async resaveDownload(jobId) {
      const response = await transport(createRuntimeRequest('RESAVE_DOWNLOAD', { jobId }));
      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }
      if (response.type !== 'RESAVE_DOWNLOAD_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }
      return response.payload.job;
    },

    async removeDownload(jobId) {
      const response = await transport(createRuntimeRequest('REMOVE_DOWNLOAD', { jobId }));
      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }
      if (response.type !== 'REMOVE_DOWNLOAD_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }
      return response.payload.removed;
    },

    async clearCompletedDownloads() {
      const response = await transport(createRuntimeRequest('CLEAR_COMPLETED_DOWNLOADS', {}));
      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }
      if (response.type !== 'CLEAR_COMPLETED_DOWNLOADS_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }
      return response.payload.removedIds;
    },

    async pauseAllDownloads() {
      const response = await transport(createRuntimeRequest('PAUSE_ALL_DOWNLOADS', {}));
      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }
      if (response.type !== 'PAUSE_ALL_DOWNLOADS_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }
      return response.payload.pausedIds;
    },

    async ingestDirectUrl(input) {
      const response = await transport(createRuntimeRequest('INGEST_DIRECT_URL', input));
      if (isRuntimeErrorResponse(response)) {
        throw new RuntimeClientError(response.payload.message, response.payload.code, response.payload.detail);
      }
      if (response.type !== 'INGEST_DIRECT_URL_RESULT') {
        throw new RuntimeClientError(`Unexpected runtime response: ${response.type}`, 'UNEXPECTED_RESPONSE');
      }
      return response.payload.job;
    },
  };
}
