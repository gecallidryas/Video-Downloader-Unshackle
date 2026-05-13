import {
  createNativeRequest,
  isNativeFfmpegResponse,
  type NativeFfmpegExportPayload,
  type NativeFfmpegJobPayload,
  type NativeFfmpegPreviewClipPayload,
  type NativeFfmpegReadAssetBytesPayload,
  type NativeFfmpegRequest,
  type NativeFfmpegResponse,
  type NativeFfmpegThumbnailPayload,
  type NativeYtDlpExportPayload,
} from './native-ffmpeg-contract';

export const DEFAULT_NATIVE_FFMPEG_HOST = 'com.unshackle.ffmpeg';

export type NativeFfmpegClientErrorCode =
  | 'NATIVE_UNAVAILABLE'
  | 'NATIVE_TIMEOUT'
  | 'NATIVE_INVALID_RESPONSE'
  | string;

export type NativePongPayload = Extract<NativeFfmpegResponse, { type: 'PONG' }>['payload'];
type NativeCompletedPayload = Extract<NativeFfmpegResponse, { type: 'COMPLETED' }>['payload'];
type NativeThumbnailPayload = Extract<NativeFfmpegResponse, { type: 'THUMBNAIL_RESULT' }>['payload'];
type NativePreviewClipPayload = Extract<NativeFfmpegResponse, { type: 'PREVIEW_CLIP_RESULT' }>['payload'];
type NativeAssetBytesPayload = Extract<NativeFfmpegResponse, { type: 'ASSET_BYTES_RESULT' }>['payload'];
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

export interface NativePort {
  postMessage(message: NativeFfmpegRequest): void;
  disconnect(): void;
  onMessage: {
    addListener(listener: (message: unknown) => void): void;
    removeListener(listener: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(listener: () => void): void;
    removeListener(listener: () => void): void;
  };
}

export type NativeConnectNative = (hostName: string) => NativePort;

export type NativeFfmpegProgressPayload = Extract<
  NativeFfmpegResponse,
  { type: 'PROGRESS' }
>['payload'];

export interface NativeFfmpegClientOptions {
  hostName?: string;
  sendNativeMessage?: NativeSendNativeMessage;
  connectNative?: NativeConnectNative;
  timeoutMs?: number;
}

export interface NativeExportMediaOptions {
  onProgress?: (progress: NativeFfmpegProgressPayload) => void;
}

export interface NativeFfmpegClient {
  ping(): Promise<NativePongPayload>;
  exportMedia(
    payload: NativeFfmpegExportPayload,
    options?: NativeExportMediaOptions,
  ): Promise<NativeCompletedPayload>;
  exportYtDlp(
    payload: NativeYtDlpExportPayload,
    options?: NativeExportMediaOptions,
  ): Promise<NativeCompletedPayload>;
  extractThumbnail(payload: NativeFfmpegThumbnailPayload): Promise<NativeThumbnailPayload>;
  extractPreviewClip(payload: NativeFfmpegPreviewClipPayload): Promise<NativePreviewClipPayload>;
  readAssetBytes(payload: NativeFfmpegReadAssetBytesPayload): Promise<NativeAssetBytesPayload>;
  cancelJob(jobId: string): Promise<NativeFfmpegJobPayload>;
  cleanupJob(jobId: string): Promise<NativeFfmpegJobPayload>;
}

const DEFAULT_NATIVE_CONTROL_RESPONSE_TIMEOUT_MS = 10_000;
const DEFAULT_NATIVE_ASSET_RESPONSE_TIMEOUT_MS = 120_000;
const DEFAULT_NATIVE_EXPORT_RESPONSE_TIMEOUT_MS = 4 * 60 * 60 * 1000;

export function createNativeFfmpegClient(
  options: NativeFfmpegClientOptions = {},
): NativeFfmpegClient {
  const hostName = options.hostName ?? DEFAULT_NATIVE_FFMPEG_HOST;

  return {
    ping: async () =>
      (
        await sendAndExpect(
          hostName,
          createNativeRequest('PING', undefined),
          'PONG',
          withDefaultTimeout(options, DEFAULT_NATIVE_CONTROL_RESPONSE_TIMEOUT_MS),
        )
      )
        .payload as NativePongPayload,
    exportMedia: async (payload, exportOptions) =>
      (
        await streamAndExpect(
          hostName,
          createNativeRequest('EXPORT_MEDIA', payload),
          'COMPLETED',
          withDefaultTimeout(options, DEFAULT_NATIVE_EXPORT_RESPONSE_TIMEOUT_MS),
          exportOptions?.onProgress,
        )
      ).payload as NativeCompletedPayload,
    exportYtDlp: async (payload, exportOptions) =>
      (
        await streamAndExpect(
          hostName,
          createNativeRequest('EXPORT_YTDLP', payload),
          'COMPLETED',
          withDefaultTimeout(options, DEFAULT_NATIVE_EXPORT_RESPONSE_TIMEOUT_MS),
          exportOptions?.onProgress,
        )
      ).payload as NativeCompletedPayload,
    extractThumbnail: async (payload) =>
      (
        await sendAndExpect(
          hostName,
          createNativeRequest('EXTRACT_THUMBNAIL', payload),
          'THUMBNAIL_RESULT',
          withDefaultTimeout(options, DEFAULT_NATIVE_ASSET_RESPONSE_TIMEOUT_MS),
        )
      ).payload as NativeThumbnailPayload,
    extractPreviewClip: async (payload) =>
      (
        await sendAndExpect(
          hostName,
          createNativeRequest('EXTRACT_PREVIEW_CLIP', payload),
          'PREVIEW_CLIP_RESULT',
          withDefaultTimeout(options, DEFAULT_NATIVE_ASSET_RESPONSE_TIMEOUT_MS),
        )
      ).payload as NativePreviewClipPayload,
    readAssetBytes: async (payload) =>
      (
        await sendAndExpect(
          hostName,
          createNativeRequest('READ_ASSET_BYTES', payload),
          'ASSET_BYTES_RESULT',
          withDefaultTimeout(options, DEFAULT_NATIVE_ASSET_RESPONSE_TIMEOUT_MS),
        )
      ).payload as NativeAssetBytesPayload,
    cancelJob: async (jobId) =>
      (
        await sendAndExpect(
          hostName,
          createNativeRequest('CANCEL_JOB', { jobId }),
          'CANCELLED',
          withDefaultTimeout(options, DEFAULT_NATIVE_CONTROL_RESPONSE_TIMEOUT_MS),
        )
      ).payload as NativeFfmpegJobPayload,
    cleanupJob: async (jobId) =>
      (
        await sendAndExpect(
          hostName,
          createNativeRequest('CLEANUP_JOB', { jobId }),
          'CLEANED_UP',
          withDefaultTimeout(options, DEFAULT_NATIVE_CONTROL_RESPONSE_TIMEOUT_MS),
        )
      ).payload as NativeFfmpegJobPayload,
  };
}

function withDefaultTimeout(
  options: NativeFfmpegClientOptions,
  defaultTimeoutMs: number,
): NativeFfmpegClientOptions {
  return {
    ...options,
    timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
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
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(
        new NativeFfmpegClientError(
          'NATIVE_TIMEOUT',
          `Native helper did not respond within ${String(
            options.timeoutMs ?? DEFAULT_NATIVE_CONTROL_RESPONSE_TIMEOUT_MS,
          )}ms.`,
        ),
      );
    }, options.timeoutMs ?? DEFAULT_NATIVE_CONTROL_RESPONSE_TIMEOUT_MS);

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    try {
      sendNativeMessage(hostName, request, (response) => {
        const runtimeError = getChromeRuntimeError();

        if (runtimeError) {
          settle(() => reject(
            new NativeFfmpegClientError(
              'NATIVE_UNAVAILABLE',
              runtimeError.message || 'Native messaging API is unavailable.',
              runtimeError,
            ),
          ));
          return;
        }

        settle(() => resolve(response));
      });
    } catch (error) {
      settle(() => reject(
        new NativeFfmpegClientError(
          'NATIVE_UNAVAILABLE',
          error instanceof Error ? error.message : 'Native messaging API is unavailable.',
          error,
        ),
      ));
    }
  });
}

async function streamAndExpect(
  hostName: string,
  request: NativeFfmpegRequest,
  expectedType: NativeSuccessResponse['type'],
  options: NativeFfmpegClientOptions,
  onProgress?: (progress: NativeFfmpegProgressPayload) => void,
): Promise<NativeSuccessResponse> {
  const connectNative = options.connectNative ?? getChromeConnectNative();

  if (!connectNative) {
    return sendAndExpect(hostName, request, expectedType, options);
  }

  const response = await streamNativeRequest(
    hostName,
    request,
    options,
    connectNative,
    onProgress,
  );

  return validateResponse(request, expectedType, response);
}

function validateResponse(
  request: NativeFfmpegRequest,
  expectedType: NativeSuccessResponse['type'],
  response: unknown,
): NativeSuccessResponse {
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

function streamNativeRequest(
  hostName: string,
  request: NativeFfmpegRequest,
  options: NativeFfmpegClientOptions,
  connectNative: NativeConnectNative,
  onProgress?: (progress: NativeFfmpegProgressPayload) => void,
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_NATIVE_EXPORT_RESPONSE_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let port: NativePort;

    try {
      port = connectNative(hostName);
    } catch (error) {
      reject(
        new NativeFfmpegClientError(
          'NATIVE_UNAVAILABLE',
          error instanceof Error ? error.message : 'Native messaging API is unavailable.',
          error,
        ),
      );
      return;
    }

    let settled = false;
    const timeoutId = setTimeout(() => {
      settle(() =>
        reject(
          new NativeFfmpegClientError(
            'NATIVE_TIMEOUT',
            `Native helper did not respond within ${String(timeoutMs)}ms.`,
          ),
        ),
      );
    }, timeoutMs);

    const handleMessage = (message: unknown): void => {
      if (
        isNativeFfmpegResponse(message) &&
        message.type === 'PROGRESS' &&
        message.requestId === request.requestId
      ) {
        onProgress?.(message.payload);
        return;
      }

      settle(() => resolve(message));
    };

    const handleDisconnect = (): void => {
      const runtimeError = getChromeRuntimeError();
      settle(() =>
        reject(
          new NativeFfmpegClientError(
            'NATIVE_UNAVAILABLE',
            runtimeError?.message || 'Native messaging port disconnected before completion.',
            runtimeError,
          ),
        ),
      );
    };

    function settle(callback: () => void): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      port.onMessage.removeListener(handleMessage);
      port.onDisconnect.removeListener(handleDisconnect);
      try {
        port.disconnect();
      } catch {
        // Ignore disconnect errors during teardown.
      }
      callback();
    }

    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(handleDisconnect);

    try {
      port.postMessage(request);
    } catch (error) {
      settle(() =>
        reject(
          new NativeFfmpegClientError(
            'NATIVE_UNAVAILABLE',
            error instanceof Error ? error.message : 'Native messaging API is unavailable.',
            error,
          ),
        ),
      );
    }
  });
}

function getChromeConnectNative(): NativeConnectNative | undefined {
  const runtime = getChromeRuntime();
  return typeof runtime?.connectNative === 'function'
    ? (runtime.connectNative.bind(runtime) as NativeConnectNative)
    : undefined;
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
