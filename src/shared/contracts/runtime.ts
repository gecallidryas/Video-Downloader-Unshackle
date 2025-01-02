import type {
  DownloadJob,
  MediaCandidate,
  MessageEnvelope,
  QueueStats,
  RuntimeRequest,
  RuntimeResponse,
} from '@/video_downloader_types_skeleton';

export type RuntimeRequestType = RuntimeRequest['type'];
export type RuntimeResponseType = RuntimeResponse['type'];

export type RuntimeRequestOf<TType extends RuntimeRequestType> = Extract<
  RuntimeRequest,
  { type: TType }
>;

export type RuntimeResponseOf<TType extends RuntimeResponseType> = Extract<
  RuntimeResponse,
  { type: TType }
>;

export type RuntimeErrorResponse = RuntimeResponseOf<'ERROR'>;

export type RuntimeCandidatesResponse = RuntimeResponseOf<'GET_CANDIDATES_RESULT'>;
export type RuntimeDownloadResponse = RuntimeResponseOf<'START_DOWNLOAD_RESULT'>;
export type RuntimeQueueStatsResponse = RuntimeResponseOf<'GET_QUEUE_STATS_RESULT'>;

export function isRuntimeErrorResponse(
  response: RuntimeResponse,
): response is RuntimeErrorResponse {
  return response.type === 'ERROR';
}

export type {
  DownloadJob,
  MediaCandidate,
  MessageEnvelope,
  QueueStats,
  RuntimeRequest,
  RuntimeResponse,
};
