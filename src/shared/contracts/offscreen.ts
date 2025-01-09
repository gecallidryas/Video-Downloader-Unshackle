import type { MessageEnvelope } from '@/video_downloader_types_skeleton';

export const OFFSCREEN_COMMAND_TYPES = [
  'START_OPFS_MUX',
  'WRITE_SEGMENT',
  'FINALIZE_MUX_DOWNLOAD',
  'FINALIZE_MUX_DOWNLOAD_SPLIT',
  'START_MEMORY_MUX',
  'APPEND_SEGMENT_MEMORY',
  'CLEANUP_MUX_JOB',
] as const;

export type OffscreenCommandType = (typeof OFFSCREEN_COMMAND_TYPES)[number];

export interface StartOpfsMuxPayload {
  jobId: string;
  format: string;
}

export interface WriteSegmentPayload {
  jobId: string;
  index: number;
  data: string;
  trackType: 'video' | 'audio' | 'subtitle';
}

export interface FinalizeMuxPayload {
  jobId: string;
  outputName: string;
  saveAs?: boolean;
}

export interface FinalizeSplitMuxPayload extends FinalizeMuxPayload {
  chunkDurationSec: number;
}

export interface StartMemoryMuxPayload {
  jobId: string;
  format: string;
}

export interface AppendSegmentMemoryPayload {
  jobId: string;
  data: string;
  trackType: 'video' | 'audio' | 'subtitle';
}

export interface CleanupMuxJobPayload {
  jobId: string;
}

export type OffscreenCommand =
  | MessageEnvelope<'START_OPFS_MUX', StartOpfsMuxPayload>
  | MessageEnvelope<'WRITE_SEGMENT', WriteSegmentPayload>
  | MessageEnvelope<'FINALIZE_MUX_DOWNLOAD', FinalizeMuxPayload>
  | MessageEnvelope<'FINALIZE_MUX_DOWNLOAD_SPLIT', FinalizeSplitMuxPayload>
  | MessageEnvelope<'START_MEMORY_MUX', StartMemoryMuxPayload>
  | MessageEnvelope<'APPEND_SEGMENT_MEMORY', AppendSegmentMemoryPayload>
  | MessageEnvelope<'CLEANUP_MUX_JOB', CleanupMuxJobPayload>;

type OffscreenPayloadMap = {
  [TType in OffscreenCommandType]: Extract<OffscreenCommand, { type: TType }>['payload'];
};

export function createOffscreenCommand<TType extends OffscreenCommandType>(
  type: TType,
  payload: OffscreenPayloadMap[TType],
  requestId = `offscreen-${Date.now()}-${Math.random().toString(36).slice(2)}`,
): MessageEnvelope<TType, OffscreenPayloadMap[TType]> {
  return {
    type,
    requestId,
    payload,
  };
}

function hasJobId(payload: unknown): payload is { jobId: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'jobId' in payload &&
    typeof payload.jobId === 'string' &&
    payload.jobId.length > 0
  );
}

export function isOffscreenCommand(value: unknown): value is OffscreenCommand {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    !('payload' in value) ||
    !('requestId' in value) ||
    !OFFSCREEN_COMMAND_TYPES.includes(value.type as OffscreenCommandType)
  ) {
    return false;
  }

  const command = value as { type: OffscreenCommandType; payload: unknown };

  if (!hasJobId(command.payload)) {
    return false;
  }

  switch (command.type) {
    case 'WRITE_SEGMENT':
      return (
        typeof (command.payload as WriteSegmentPayload).index === 'number' &&
        typeof (command.payload as WriteSegmentPayload).data === 'string'
      );
    case 'APPEND_SEGMENT_MEMORY':
      return typeof (command.payload as AppendSegmentMemoryPayload).data === 'string';
    case 'FINALIZE_MUX_DOWNLOAD_SPLIT':
      return typeof (command.payload as FinalizeSplitMuxPayload).chunkDurationSec === 'number';
    default:
      return true;
  }
}
