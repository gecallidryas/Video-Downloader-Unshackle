import type { JobOutput, MessageEnvelope } from '@/video_downloader_types_skeleton';

export const OFFSCREEN_COMMAND_TYPES = [
  'START_OPFS_MUX',
  'WRITE_SEGMENT',
  'FINALIZE_MUX_DOWNLOAD',
  'FINALIZE_MUX_DOWNLOAD_SPLIT',
  'START_MEMORY_MUX',
  'APPEND_SEGMENT_MEMORY',
  'CLEANUP_MUX_JOB',
  'START_BROWSER_HLS_EXPORT',
  'APPEND_BROWSER_HLS_SEGMENT',
  'FINALIZE_BROWSER_HLS_EXPORT',
  'PING_BROWSER_HLS_EXPORT',
  'ABORT_BROWSER_HLS_EXPORT',
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

export type BrowserHlsExportRoute =
  | 'hls-ts-streaming-mp4'
  | 'hls-ts-opfs-mp4'
  | 'hls-ts-raw-stream'
  | 'hls-ts-raw-opfs'
  | 'hls-fmp4-staged'
  | 'unsupported-browser-only';

export type BrowserExportSinkKind =
  | 'file-system-access'
  | 'opfs'
  | 'blob-memory'
  | 'chrome-download';

export type BrowserHlsExportMimeType = 'video/mp4' | 'video/mp2t' | 'application/octet-stream';

export interface StartBrowserHlsExportPayload {
  jobId: string;
  route: BrowserHlsExportRoute;
  outputName: string;
  mimeType: BrowserHlsExportMimeType;
  sinkKind: BrowserExportSinkKind;
  saveAs?: boolean;
  memoryCeilingBytes?: number;
  rawFallbackAllowed?: boolean;
}

export interface AppendBrowserHlsSegmentPayload {
  jobId: string;
  segment: {
    id: string;
    index: number;
    url: string;
    initSegment?: boolean;
    durationSec?: number;
  };
  // Raw segment bytes. chrome.runtime.sendMessage serializes payloads with the
  // structured clone algorithm, which copies typed arrays directly. We carry
  // the Uint8Array as-is instead of base64 to avoid the +33% size inflation and
  // the full String.fromCharCode/btoa/atob string copy per segment. True
  // zero-copy transfer (transferables) is NOT possible here because
  // chrome.runtime.sendMessage does not accept a transfer list — only
  // Worker/MessagePort/window postMessage do.
  bytes: Uint8Array;
  isInitSegment: boolean;
}

export interface BrowserHlsExportDiagnostic {
  kind: 'mux-failure';
  route: BrowserHlsExportRoute;
  sinkKind: BrowserExportSinkKind;
  outputName: string;
  mimeType: BrowserHlsExportMimeType;
  rawFallbackAllowed: boolean;
  phase: 'append' | 'finalize';
  message: string;
  muxErrorCode?: string;
  segmentId?: string;
  segmentIndex?: number;
  segmentUrl?: string;
  segmentBytes?: number;
  firstBytesHex?: string;
  hasTsSyncByteAt0?: boolean;
  hasTsSyncByteAt188?: boolean;
}

export interface FinalizeBrowserHlsExportPayload {
  jobId: string;
}

export interface PingBrowserHlsExportPayload {
  jobId: string;
}

export interface AbortBrowserHlsExportPayload {
  jobId: string;
  reason?: string;
}

export interface BrowserHlsExportResponse {
  ok: boolean;
  command?: OffscreenCommandType;
  bytesWritten?: number;
  output?: JobOutput;
  error?: string;
  diagnostics?: BrowserHlsExportDiagnostic[];
}

export type OffscreenCommand =
  | MessageEnvelope<'START_OPFS_MUX', StartOpfsMuxPayload>
  | MessageEnvelope<'WRITE_SEGMENT', WriteSegmentPayload>
  | MessageEnvelope<'FINALIZE_MUX_DOWNLOAD', FinalizeMuxPayload>
  | MessageEnvelope<'FINALIZE_MUX_DOWNLOAD_SPLIT', FinalizeSplitMuxPayload>
  | MessageEnvelope<'START_MEMORY_MUX', StartMemoryMuxPayload>
  | MessageEnvelope<'APPEND_SEGMENT_MEMORY', AppendSegmentMemoryPayload>
  | MessageEnvelope<'CLEANUP_MUX_JOB', CleanupMuxJobPayload>
  | MessageEnvelope<'START_BROWSER_HLS_EXPORT', StartBrowserHlsExportPayload>
  | MessageEnvelope<'APPEND_BROWSER_HLS_SEGMENT', AppendBrowserHlsSegmentPayload>
  | MessageEnvelope<'FINALIZE_BROWSER_HLS_EXPORT', FinalizeBrowserHlsExportPayload>
  | MessageEnvelope<'PING_BROWSER_HLS_EXPORT', PingBrowserHlsExportPayload>
  | MessageEnvelope<'ABORT_BROWSER_HLS_EXPORT', AbortBrowserHlsExportPayload>;

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
    case 'START_BROWSER_HLS_EXPORT': {
      const payload = command.payload as StartBrowserHlsExportPayload;
      return (
        typeof payload.outputName === 'string' &&
        typeof payload.mimeType === 'string' &&
        typeof payload.route === 'string' &&
        typeof payload.sinkKind === 'string'
      );
    }
    case 'APPEND_BROWSER_HLS_SEGMENT': {
      const payload = command.payload as AppendBrowserHlsSegmentPayload;
      return (
        payload.bytes instanceof Uint8Array &&
        typeof payload.segment === 'object' &&
        payload.segment !== null &&
        typeof payload.segment.id === 'string' &&
        typeof payload.segment.index === 'number'
      );
    }
    case 'FINALIZE_MUX_DOWNLOAD_SPLIT':
      return typeof (command.payload as FinalizeSplitMuxPayload).chunkDurationSec === 'number';
    default:
      return true;
  }
}
