import {
  createNativeRequest,
  isNativeFfmpegResponse,
  type NativeFfmpegExportPayload,
  type NativeFfmpegJobPayload,
  type NativeFfmpegPreviewClipPayload,
  type NativeFfmpegRequest,
  type NativeFfmpegResponse,
  type NativeFfmpegThumbnailPayload,
} from './native-ffmpeg-contract';

export const DEFAULT_NATIVE_FFMPEG_HOST = 'com.unshackle.ffmpeg';

export type NativeFfmpegClientErrorCode =
  | 'NATIVE_UNAVAILABLE'
  | 'NATIVE_INVALID_RESPONSE'
  | string;

type NativePongPayload = Extract<NativeFfmpegResponse, { type: 'PONG' }>['payload'];
type NativeCompletedPayload = Extract<NativeFfmpegResponse, { type: 'COMPLETED' }>['payload'];
type NativeThumbnailPayload = Extract<NativeFfmpegResponse, { type: 'THUMBNAIL_RESULT' }>['payload'];
type NativePreviewClipPayload = Extract<NativeFfmpegResponse, { type: 'PREVIEW_CLIP_RESULT' }>['payload'];
type NativeSuccessResponse = Exclude<NativeFfmpegResponse, { type: 'ERROR' }>;

export class NativeFfmpegClientError extends Error {
  readonly code: NativeFfmpegClientErrorCode;
  readonly detail?: unknown;

  constructor(code: NativeFfmpegClientErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'NativeFfmpegClientError';
    this.code = code;
    this.detail = detail;
  }
}

const nativeUnavailableCodes = new Set(['NATIVE_UNAVAILABLE', 'FFMPEG_NOT_FOUND']);

export function isNativeFfmpegUnavailableError(error: unknown): boolean {
  if (error instanceof NativeFfmpegClientError) {
    return nativeUnavailableCodes.has(error.code);
  }

  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && nativeUnavailableCodes.has(code);
}

export type NativeSendNativeMessage = (
  hostName: string,
  message: NativeFfmpegRequest,
  callback: (response: unknown) => void,
) => void;

export interface NativeFfmpegClientOptions {
  hostName?: string;
  sendNativeMessage?: NativeSendNativeMessage;
}

export interface NativeFfmpegClient {
  ping(): Promise<NativePongPayload>;
  exportMedia(payload: NativeFfmpegExportPayload): Promise<NativeCompletedPayload>;
  extractThumbnail(payload: NativeFfmpegThumbnailPayload): Promise<NativeThumbnailPayload>;
  extractPreviewClip(payload: NativeFfmpegPreviewClipPayload): Promise<NativePreviewClipPayload>;
  cancelJob(jobId: string): Promise<NativeFfmpegJobPayload>;
  cleanupJob(jobId: string): Promise<NativeFfmpegJobPayload>;
}

export function createNativeFfmpegClient(
  options: NativeFfmpegClientOptions = {},
): NativeFfmpegClient {
  const hostName = options.hostName ?? DEFAULT_NATIVE_FFMPEG_HOST;

  return {
    ping: async () =>
      (await sendAndExpect(hostName, createNativeRequest('PING', undefined), 'PONG', options))
        .payload as NativePongPayload,
    exportMedia: async (payload) =>
      (
        await sendAndExpect(
          hostName,
          createNativeRequest('EXPORT_MEDIA', payload),
          'COMPLETED',
          options,
        )
      ).payload as NativeCompletedPayload,
    extractThumbnail: async (payload) =>
      (
        await sendAndExpect(
          hostName,
          createNativeRequest('EXTRACT_THUMBNAIL', payload),
          'THUMBNAIL_RESULT',
          options,
        )
      ).payload as NativeThumbnailPayload,
    extractPreviewClip: async (payload) =>
      (
        await sendAndExpect(
          hostName,
          createNativeRequest('EXTRACT_PREVIEW_CLIP', payload),
          'PREVIEW_CLIP_RESULT',
          options,
        )
      ).payload as NativePreviewClipPayload,
    cancelJob: async (jobId) =>
      (
        await sendAndExpect(
          hostName,
          createNativeRequest('CANCEL_JOB', { jobId }),
          'CANCELLED',
          options,
        )
      ).payload as NativeFfmpegJobPayload,
    cleanupJob: async (jobId) =>
      (
        await sendAndExpect(
          hostName,
          createNativeRequest('CLEANUP_JOB', { jobId }),
          'CLEANED_UP',
          options,
        )
      ).payload as NativeFfmpegJobPayload,
  };
}

async function sendAndExpect(
  hostName: string,
  request: NativeFfmpegRequest,
  expectedType: NativeSuccessResponse['type'],
  options: NativeFfmpegClientOptions,
): Promise<NativeSuccessResponse> {
  const response = await sendNativeRequest(hostName, request, options);

  if (!isNativeFfmpegResponse(response)) {
    throw new NativeFfmpegClientError(
      'NATIVE_INVALID_RESPONSE',
      'Native helper returned an invalid response.',
      response,
    );
  }

  if (response.requestId !== request.requestId) {
    throw new NativeFfmpegClientError(
      'NATIVE_INVALID_RESPONSE',
      'Native helper returned an unexpected response.',
      response,
    );
  }

  if (response.type === 'ERROR') {
    throw new NativeFfmpegClientError(
      response.payload.code,
      response.payload.message,
      response.payload.detail,
    );
  }

  if (response.type !== expectedType) {
    throw new NativeFfmpegClientError(
      'NATIVE_INVALID_RESPONSE',
      'Native helper returned an unexpected response.',
      response,
    );
  }

  return response;
}

function sendNativeRequest(
  hostName: string,
  request: NativeFfmpegRequest,
  options: NativeFfmpegClientOptions,
): Promise<unknown> {
  const sendNativeMessage = options.sendNativeMessage ?? getChromeSendNativeMessage();

  if (!sendNativeMessage) {
    return Promise.reject(
      new NativeFfmpegClientError(
        'NATIVE_UNAVAILABLE',
        'Native messaging API is unavailable.',
      ),
    );
  }

  return new Promise((resolve, reject) => {
    try {
      sendNativeMessage(hostName, request, (response) => {
        const runtimeError = getChromeRuntimeError();

        if (runtimeError) {
          reject(
            new NativeFfmpegClientError(
              'NATIVE_UNAVAILABLE',
              runtimeError.message || 'Native messaging API is unavailable.',
              runtimeError,
            ),
          );
          return;
        }

        resolve(response);
      });
    } catch (error) {
      reject(
        new NativeFfmpegClientError(
          'NATIVE_UNAVAILABLE',
          error instanceof Error ? error.message : 'Native messaging API is unavailable.',
          error,
        ),
      );
    }
  });
}

function getChromeSendNativeMessage(): NativeSendNativeMessage | undefined {
  const runtime = getChromeRuntime();
  return typeof runtime?.sendNativeMessage === 'function'
    ? runtime.sendNativeMessage.bind(runtime)
    : undefined;
}

function getChromeRuntimeError(): chrome.runtime.LastError | undefined {
  return getChromeRuntime()?.lastError;
}

function getChromeRuntime(): typeof chrome.runtime | undefined {
  return typeof chrome === 'undefined' ? undefined : chrome.runtime;
}
