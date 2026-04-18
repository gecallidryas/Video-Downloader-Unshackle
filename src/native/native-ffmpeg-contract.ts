export type NativeFfmpegProtocol = 'direct' | 'hls' | 'dash';
export type NativeFfmpegOutputKind = 'original' | 'mp4' | 'mkv' | 'webm' | 'audio-only';
export type NativeFfmpegPreviewFormat = 'webm' | 'mp4' | 'gif';
export type NativeFfmpegThumbnailFormat = 'jpg' | 'png' | 'webp';

export interface NativeFfmpegTrim {
  startSec?: number;
  endSec?: number;
}

export interface NativeFfmpegExportPayload {
  jobId: string;
  inputUrl: string;
  protocol: NativeFfmpegProtocol;
  outputPath?: string;
  outputName: string;
  outputKind: NativeFfmpegOutputKind;
  trim?: NativeFfmpegTrim;
  headers?: Record<string, string>;
}

export type NativeYtDlpQuality = 'best' | 'best-mp4' | 'worst' | 'audio-only';

export interface NativeYtDlpExportPayload {
  jobId: string;
  inputUrl: string;
  outputName: string;
  outputPath?: string;
  quality: NativeYtDlpQuality;
  subtitleLanguages?: string[];
  embedSubtitles?: boolean;
  trim?: NativeFfmpegTrim;
  headers?: Record<string, string>;
}

export interface NativeFfmpegProbePayload {
  inputUrl: string;
  headers?: Record<string, string>;
}

export interface NativeFfmpegThumbnailPayload {
  candidateId: string;
  inputUrl: string;
  atSec?: number;
  format: NativeFfmpegThumbnailFormat;
  headers?: Record<string, string>;
}

export interface NativeFfmpegPreviewClipPayload {
  candidateId: string;
  inputUrl: string;
  startSec?: number;
  durationSec: number;
  format: NativeFfmpegPreviewFormat;
  headers?: Record<string, string>;
}

export interface NativeFfmpegJobPayload {
  jobId: string;
}

export interface NativeFfmpegReadAssetBytesPayload {
  outputPath: string;
  maxBytes: number;
  offset?: number;
}

export type NativeFfmpegInstallKind = 'dev' | 'per-user' | 'system';

export interface NativeFfmpegPongPayload {
  version: string;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  ytDlpAvailable?: boolean;
  platform: string;
  installKind?: NativeFfmpegInstallKind;
}

export type NativeFfmpegRequest =
  | { type: 'PING'; requestId: string }
  | { type: 'PROBE'; requestId: string; payload: NativeFfmpegProbePayload }
  | { type: 'EXPORT_MEDIA'; requestId: string; payload: NativeFfmpegExportPayload }
  | { type: 'EXPORT_YTDLP'; requestId: string; payload: NativeYtDlpExportPayload }
  | { type: 'EXTRACT_THUMBNAIL'; requestId: string; payload: NativeFfmpegThumbnailPayload }
  | { type: 'EXTRACT_PREVIEW_CLIP'; requestId: string; payload: NativeFfmpegPreviewClipPayload }
  | { type: 'READ_ASSET_BYTES'; requestId: string; payload: NativeFfmpegReadAssetBytesPayload }
  | { type: 'CANCEL_JOB'; requestId: string; payload: NativeFfmpegJobPayload }
  | { type: 'CLEANUP_JOB'; requestId: string; payload: NativeFfmpegJobPayload };

export type NativeFfmpegRequestType = NativeFfmpegRequest['type'];

export type NativeFfmpegRequestPayload<TType extends NativeFfmpegRequestType> = Extract<
  NativeFfmpegRequest,
  { type: TType }
> extends { payload: infer TPayload }
  ? TPayload
  : undefined;

export type NativeFfmpegProgressPhase =
  | 'preparing'
  | 'probing'
  | 'fetching'
  | 'transmuxing'
  | 'exporting'
  | 'extracting'
  | 'completed';

export interface NativeFfmpegErrorPayload {
  code: string;
  message: string;
  detail?: unknown;
}

export type NativeFfmpegResponse =
  | {
      type: 'PONG';
      requestId: string;
      payload: NativeFfmpegPongPayload;
    }
  | {
      type: 'PROBE_RESULT';
      requestId: string;
      payload: {
        durationSec?: number;
        width?: number;
        height?: number;
        formatName?: string;
        codecs?: string[];
      };
    }
  | {
      type: 'PROGRESS';
      requestId: string;
      payload: {
        jobId: string;
        progressPct: number;
        phase: NativeFfmpegProgressPhase;
        timeSec?: number;
      };
    }
  | {
      type: 'COMPLETED';
      requestId: string;
      payload: {
        jobId: string;
        outputPath: string;
        sizeBytes?: number;
        mimeType?: string;
      };
    }
  | {
      type: 'THUMBNAIL_RESULT';
      requestId: string;
      payload: { candidateId: string; outputPath: string; mimeType: string; dataUrl: string };
    }
  | {
      type: 'PREVIEW_CLIP_RESULT';
      requestId: string;
      payload: { candidateId: string; outputPath: string; mimeType: string; dataUrl?: string; sizeBytes?: number };
    }
  | {
      type: 'ASSET_BYTES_RESULT';
      requestId: string;
      payload: { outputPath: string; mimeType?: string; sizeBytes: number; base64: string; eof?: boolean };
    }
  | { type: 'CANCELLED'; requestId: string; payload: NativeFfmpegJobPayload }
  | { type: 'CLEANED_UP'; requestId: string; payload: NativeFfmpegJobPayload }
  | { type: 'ERROR'; requestId: string; payload: NativeFfmpegErrorPayload };

type NativeFfmpegRequestPayloadMap = {
  PING: undefined;
  PROBE: NativeFfmpegProbePayload;
  EXPORT_MEDIA: NativeFfmpegExportPayload;
  EXPORT_YTDLP: NativeYtDlpExportPayload;
  EXTRACT_THUMBNAIL: NativeFfmpegThumbnailPayload;
  EXTRACT_PREVIEW_CLIP: NativeFfmpegPreviewClipPayload;
  READ_ASSET_BYTES: NativeFfmpegReadAssetBytesPayload;
  CANCEL_JOB: NativeFfmpegJobPayload;
  CLEANUP_JOB: NativeFfmpegJobPayload;
};

const REQUEST_TYPES = [
  'PING',
  'PROBE',
  'EXPORT_MEDIA',
  'EXPORT_YTDLP',
  'EXTRACT_THUMBNAIL',
  'EXTRACT_PREVIEW_CLIP',
  'READ_ASSET_BYTES',
  'CANCEL_JOB',
  'CLEANUP_JOB',
] as const satisfies readonly NativeFfmpegRequestType[];

const PROTOCOLS = ['direct', 'hls', 'dash'] as const satisfies readonly NativeFfmpegProtocol[];
const OUTPUT_KINDS = [
  'original',
  'mp4',
  'mkv',
  'webm',
  'audio-only',
] as const satisfies readonly NativeFfmpegOutputKind[];
const PREVIEW_FORMATS = ['webm', 'mp4', 'gif'] as const satisfies readonly NativeFfmpegPreviewFormat[];
const YTDLP_QUALITIES = [
  'best',
  'best-mp4',
  'worst',
  'audio-only',
] as const satisfies readonly NativeYtDlpQuality[];
const THUMBNAIL_FORMATS = ['jpg', 'png', 'webp'] as const satisfies readonly NativeFfmpegThumbnailFormat[];
const PROGRESS_PHASES = [
  'preparing',
  'probing',
  'fetching',
  'transmuxing',
  'exporting',
  'extracting',
  'completed',
] as const satisfies readonly NativeFfmpegProgressPhase[];

export function createNativeRequest<TType extends NativeFfmpegRequestType>(
  type: TType,
  payload: NativeFfmpegRequestPayloadMap[TType],
  requestId = createRequestId(),
): Extract<NativeFfmpegRequest, { type: TType }> {
  if (type === 'PING') {
    return { type, requestId } as Extract<NativeFfmpegRequest, { type: TType }>;
  }

  return { type, requestId, payload } as Extract<NativeFfmpegRequest, { type: TType }>;
}

export function nativeError(
  code: string,
  message: string,
  requestId: string,
): Extract<NativeFfmpegResponse, { type: 'ERROR' }> {
  return {
    type: 'ERROR',
    requestId,
    payload: { code, message },
  };
}

export function isNativeFfmpegRequest(value: unknown): value is NativeFfmpegRequest {
  if (!isRecord(value) || !isString(value.type) || !isString(value.requestId)) {
    return false;
  }

  if (!includes(REQUEST_TYPES, value.type)) {
    return false;
  }

  switch (value.type) {
    case 'PING':
      return hasOnlyKeys(value, ['type', 'requestId']);
    case 'PROBE':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isProbePayload(value.payload);
    case 'EXPORT_MEDIA':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isExportPayload(value.payload);
    case 'EXPORT_YTDLP':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isYtDlpExportPayload(value.payload);
    case 'EXTRACT_THUMBNAIL':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isThumbnailPayload(value.payload);
    case 'EXTRACT_PREVIEW_CLIP':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isPreviewClipPayload(value.payload);
    case 'READ_ASSET_BYTES':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isReadAssetBytesPayload(value.payload);
    case 'CANCEL_JOB':
    case 'CLEANUP_JOB':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isJobPayload(value.payload);
    default:
      return false;
  }
}

export function isNativeFfmpegResponse(value: unknown): value is NativeFfmpegResponse {
  if (!isRecord(value) || !isString(value.type) || !isString(value.requestId)) {
    return false;
  }

  switch (value.type) {
    case 'PONG':
      return (
        hasOnlyKeys(value, ['type', 'requestId', 'payload']) &&
        isRecord(value.payload) &&
        hasOnlyKeys(value.payload, [
          'version',
          'ffmpegAvailable',
          'ffprobeAvailable',
          'ytDlpAvailable',
          'platform',
          'installKind',
        ]) &&
        isString(value.payload.version) &&
        typeof value.payload.ffmpegAvailable === 'boolean' &&
        typeof value.payload.ffprobeAvailable === 'boolean' &&
        (value.payload.ytDlpAvailable === undefined ||
          typeof value.payload.ytDlpAvailable === 'boolean') &&
        isString(value.payload.platform) &&
        (value.payload.installKind === undefined ||
          ['dev', 'per-user', 'system'].includes(String(value.payload.installKind)))
      );
    case 'PROBE_RESULT':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isProbeResultPayload(value.payload);
    case 'PROGRESS':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isProgressPayload(value.payload);
    case 'COMPLETED':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isCompletedPayload(value.payload);
    case 'THUMBNAIL_RESULT':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isAssetResultPayload(value.payload);
    case 'PREVIEW_CLIP_RESULT':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isPreviewAssetResultPayload(value.payload);
    case 'ASSET_BYTES_RESULT':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isAssetBytesPayload(value.payload);
    case 'CANCELLED':
    case 'CLEANED_UP':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isJobPayload(value.payload);
    case 'ERROR':
      return hasOnlyKeys(value, ['type', 'requestId', 'payload']) && isErrorPayload(value.payload);
    default:
      return false;
  }
}

function isProbePayload(value: unknown): value is NativeFfmpegProbePayload {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['inputUrl', 'headers']) &&
    isString(value.inputUrl) &&
    isOptionalHeaders(value.headers)
  );
}

function isExportPayload(value: unknown): value is NativeFfmpegExportPayload {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'jobId',
      'inputUrl',
      'protocol',
      'outputPath',
      'outputName',
      'outputKind',
      'trim',
      'headers',
    ]) &&
    isString(value.jobId) &&
    isString(value.inputUrl) &&
    includes(PROTOCOLS, value.protocol) &&
    isOptionalString(value.outputPath) &&
    isString(value.outputName) &&
    includes(OUTPUT_KINDS, value.outputKind) &&
    isOptionalTrim(value.trim) &&
    isOptionalHeaders(value.headers)
  );
}

function isYtDlpExportPayload(value: unknown): value is NativeYtDlpExportPayload {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'jobId',
      'inputUrl',
      'outputName',
      'outputPath',
      'quality',
      'subtitleLanguages',
      'embedSubtitles',
      'trim',
      'headers',
    ]) &&
    isString(value.jobId) &&
    isHttpUrl(value.inputUrl) &&
    isString(value.outputName) &&
    includes(YTDLP_QUALITIES, value.quality) &&
    isOptionalString(value.outputPath) &&
    isOptionalStringArray(value.subtitleLanguages) &&
    (value.embedSubtitles === undefined || typeof value.embedSubtitles === 'boolean') &&
    isOptionalTrim(value.trim) &&
    isOptionalHeaders(value.headers)
  );
}

function isThumbnailPayload(value: unknown): value is NativeFfmpegThumbnailPayload {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['candidateId', 'inputUrl', 'atSec', 'format', 'headers']) &&
    isString(value.candidateId) &&
    isString(value.inputUrl) &&
    isOptionalNonNegativeNumber(value.atSec) &&
    includes(THUMBNAIL_FORMATS, value.format) &&
    isOptionalHeaders(value.headers)
  );
}

function isPreviewClipPayload(value: unknown): value is NativeFfmpegPreviewClipPayload {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['candidateId', 'inputUrl', 'startSec', 'durationSec', 'format', 'headers']) &&
    isString(value.candidateId) &&
    isString(value.inputUrl) &&
    isOptionalNonNegativeNumber(value.startSec) &&
    isPositiveNumber(value.durationSec) &&
    includes(PREVIEW_FORMATS, value.format) &&
    isOptionalHeaders(value.headers)
  );
}

function isJobPayload(value: unknown): value is NativeFfmpegJobPayload {
  return isRecord(value) && hasOnlyKeys(value, ['jobId']) && isString(value.jobId);
}

function isReadAssetBytesPayload(value: unknown): value is NativeFfmpegReadAssetBytesPayload {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['outputPath', 'maxBytes', 'offset']) &&
    isString(value.outputPath) &&
    isPositiveNumber(value.maxBytes) &&
    (value.offset === undefined || isNumberInRange(value.offset, 0, Number.POSITIVE_INFINITY))
  );
}

function isProbeResultPayload(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['durationSec', 'width', 'height', 'formatName', 'codecs']) &&
    isOptionalNonNegativeNumber(value.durationSec) &&
    isOptionalNonNegativeNumber(value.width) &&
    isOptionalNonNegativeNumber(value.height) &&
    isOptionalString(value.formatName) &&
    (value.codecs === undefined || (Array.isArray(value.codecs) && value.codecs.every(isString)))
  );
}

function isProgressPayload(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['jobId', 'progressPct', 'phase', 'timeSec']) &&
    isString(value.jobId) &&
    isNumberInRange(value.progressPct, 0, 100) &&
    includes(PROGRESS_PHASES, value.phase) &&
    isOptionalNonNegativeNumber(value.timeSec)
  );
}

function isCompletedPayload(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['jobId', 'outputPath', 'sizeBytes', 'mimeType']) &&
    isString(value.jobId) &&
    isString(value.outputPath) &&
    isOptionalNonNegativeNumber(value.sizeBytes) &&
    isOptionalString(value.mimeType)
  );
}

function isAssetResultPayload(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['candidateId', 'outputPath', 'mimeType', 'dataUrl']) &&
    isString(value.candidateId) &&
    isString(value.outputPath) &&
    isString(value.mimeType) &&
    isString(value.dataUrl)
  );
}

function isPreviewAssetResultPayload(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['candidateId', 'outputPath', 'mimeType', 'dataUrl', 'sizeBytes']) &&
    isString(value.candidateId) &&
    isString(value.outputPath) &&
    isString(value.mimeType) &&
    isOptionalString(value.dataUrl) &&
    isOptionalNonNegativeNumber(value.sizeBytes)
  );
}

function isAssetBytesPayload(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['outputPath', 'mimeType', 'sizeBytes', 'base64', 'eof']) &&
    isString(value.outputPath) &&
    isOptionalString(value.mimeType) &&
    isNumberInRange(value.sizeBytes, 0, Number.POSITIVE_INFINITY) &&
    isString(value.base64) &&
    (value.eof === undefined || typeof value.eof === 'boolean')
  );
}

function isErrorPayload(value: unknown): value is NativeFfmpegErrorPayload {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['code', 'message', 'detail']) &&
    isString(value.code) &&
    isString(value.message)
  );
}

function isOptionalTrim(value: unknown): value is NativeFfmpegTrim | undefined {
  if (value === undefined) {
    return true;
  }

  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['startSec', 'endSec']) ||
    !isOptionalNonNegativeNumber(value.startSec) ||
    !isOptionalNonNegativeNumber(value.endSec)
  ) {
    return false;
  }

  return (
    value.startSec === undefined ||
    value.endSec === undefined ||
    value.endSec > value.startSec
  );
}

function isOptionalHeaders(value: unknown): value is Record<string, string> | undefined {
  return value === undefined || (isRecord(value) && Object.values(value).every(isString));
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(isString));
}

function isHttpUrl(value: unknown): value is string {
  if (!isString(value) || value.trim() !== value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isOptionalNonNegativeNumber(value: unknown): value is number | undefined {
  return value === undefined || isNumberInRange(value, 0, Number.POSITIVE_INFINITY);
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function includes<TValue extends string>(
  values: readonly TValue[],
  value: unknown,
): value is TValue {
  return typeof value === 'string' && values.includes(value as TValue);
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `native-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
