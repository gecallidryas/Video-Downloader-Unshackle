import { afterEach, describe, expect, test, vi } from 'vitest';
import type {
  NativeFfmpegExportPayload,
  NativeFfmpegPreviewClipPayload,
  NativeFfmpegThumbnailPayload,
} from '../native-ffmpeg-contract';
import {
  createNativeFfmpegClient,
  DEFAULT_NATIVE_FFMPEG_HOST,
  NativeFfmpegClientError,
  type NativeConnectNative,
  type NativeFfmpegProgressPayload,
  type NativePort,
  type NativeSendNativeMessage,
} from '../native-ffmpeg-client';
import type { NativeFfmpegRequest } from '../native-ffmpeg-contract';

type NativeRequest = Parameters<NativeSendNativeMessage>[1];
type NativeCallback = Parameters<NativeSendNativeMessage>[2];

function createFakePort(
  onPost: (request: NativeFfmpegRequest, port: FakePort) => void,
): FakePort {
  return new FakePort(onPost);
}

class FakePort implements NativePort {
  private readonly messageListeners = new Set<(message: unknown) => void>();
  private readonly disconnectListeners = new Set<() => void>();
  disconnected = false;

  constructor(private readonly onPost: (request: NativeFfmpegRequest, port: FakePort) => void) {}

  postMessage(request: NativeFfmpegRequest): void {
    this.onPost(request, this);
  }

  emit(message: unknown): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  fail(): void {
    for (const listener of this.disconnectListeners) {
      listener();
    }
  }

  disconnect(): void {
    this.disconnected = true;
  }

  onMessage = {
    addListener: (listener: (message: unknown) => void) => this.messageListeners.add(listener),
    removeListener: (listener: (message: unknown) => void) =>
      this.messageListeners.delete(listener),
  };

  onDisconnect = {
    addListener: (listener: () => void) => this.disconnectListeners.add(listener),
    removeListener: (listener: () => void) => this.disconnectListeners.delete(listener),
  };
}

describe('native ffmpeg client', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('../native-ffmpeg-contract');
    vi.resetModules();
  });

  test('ping calls chrome.runtime.sendNativeMessage with the default host', async () => {
    const sendNativeMessage = vi.fn((hostName: string, request: NativeRequest, callback: NativeCallback) => {
      callback({
        type: 'PONG',
        requestId: request.requestId,
        payload: {
          version: '1.0.0',
          ffmpegAvailable: true,
          ffprobeAvailable: true,
          platform: 'win32',
          installKind: 'per-user',
        },
      });
    });
    vi.stubGlobal('chrome', { runtime: { sendNativeMessage } });

    const client = createNativeFfmpegClient();
    await expect(client.ping()).resolves.toEqual({
      version: '1.0.0',
      ffmpegAvailable: true,
      ffprobeAvailable: true,
      platform: 'win32',
      installKind: 'per-user',
    });

    expect(sendNativeMessage).toHaveBeenCalledTimes(1);
    expect(sendNativeMessage).toHaveBeenCalledWith(
      DEFAULT_NATIVE_FFMPEG_HOST,
      expect.objectContaining({ type: 'PING', requestId: expect.any(String) }),
      expect.any(Function),
    );
  });

  test('missing native messaging API rejects with a typed NATIVE_UNAVAILABLE error', async () => {
    vi.stubGlobal('chrome', { runtime: {} });

    const client = createNativeFfmpegClient();

    await expect(client.ping()).rejects.toMatchObject({
      code: 'NATIVE_UNAVAILABLE',
      message: 'Native messaging API is unavailable.',
    });
    await expect(client.ping()).rejects.toBeInstanceOf(NativeFfmpegClientError);
  });

  test('ping times out when Chrome never calls the native callback', async () => {
    vi.useFakeTimers();
    const client = createNativeFfmpegClient({
      timeoutMs: 100,
      sendNativeMessage: vi.fn(),
    });

    const result = expect(client.ping()).rejects.toMatchObject({
      code: 'NATIVE_TIMEOUT',
      message: expect.stringContaining('did not respond'),
    });

    await vi.advanceTimersByTimeAsync(100);
    await result;
    vi.useRealTimers();
  });

  test('media operations use longer default timeouts than readiness ping', async () => {
    vi.useFakeTimers();
    const client = createNativeFfmpegClient({
      sendNativeMessage: (_hostName, request, callback) => {
        setTimeout(() => {
          callback({
            type: 'COMPLETED',
            requestId: request.requestId,
            payload: {
              jobId: request.type === 'EXPORT_MEDIA' ? request.payload.jobId : 'job-1',
              outputPath: 'C:\\Temp\\clip.mp4',
              mimeType: 'video/mp4',
            },
          });
        }, 10_001);
      },
    });

    const result = expect(client.exportMedia(exportPayload)).resolves.toMatchObject({
      jobId: 'job-1',
      outputPath: 'C:\\Temp\\clip.mp4',
    });

    await vi.advanceTimersByTimeAsync(10_001);
    await result;
    vi.useRealTimers();
  });

  test('helper ERROR responses throw typed client errors', async () => {
    const client = createNativeFfmpegClient({
      sendNativeMessage: (_hostName, request, callback) => {
        callback({
          type: 'ERROR',
          requestId: request.requestId,
          payload: {
            code: 'FFMPEG_NOT_FOUND',
            message: 'Install ffmpeg and try again.',
            detail: { binary: 'ffmpeg' },
          },
        });
      },
    });

    await expect(client.exportMedia(exportPayload)).rejects.toMatchObject({
      code: 'FFMPEG_NOT_FOUND',
      message: 'Install ffmpeg and try again.',
      detail: { binary: 'ffmpeg' },
    });
  });

  test('helper ERROR responses must match the request id', async () => {
    const client = createNativeFfmpegClient({
      sendNativeMessage: (_hostName, _request, callback) => {
        callback({
          type: 'ERROR',
          requestId: 'stale-request',
          payload: {
            code: 'FFMPEG_NOT_FOUND',
            message: 'Install ffmpeg and try again.',
          },
        });
      },
    });

    await expect(client.ping()).rejects.toMatchObject({
      code: 'NATIVE_INVALID_RESPONSE',
      message: 'Native helper returned an unexpected response.',
    });
  });

  test('export, thumbnail, preview, cancel, and cleanup commands use contract request shapes', async () => {
    const sentRequests: NativeRequest[] = [];
    const client = createNativeFfmpegClient({
      hostName: 'com.example.test',
      sendNativeMessage: (_hostName, request, callback) => {
        sentRequests.push(request);

        if (request.type === 'EXPORT_MEDIA') {
          callback({
            type: 'COMPLETED',
            requestId: request.requestId,
            payload: {
              jobId: request.payload.jobId,
              outputPath: 'C:\\Temp\\clip.mp4',
              sizeBytes: 1024,
              mimeType: 'video/mp4',
            },
          });
          return;
        }

        if (request.type === 'EXTRACT_THUMBNAIL') {
          callback({
            type: 'THUMBNAIL_RESULT',
            requestId: request.requestId,
            payload: {
              candidateId: request.payload.candidateId,
              outputPath: 'C:\\Temp\\thumb.jpg',
              mimeType: 'image/jpeg',
              dataUrl: 'data:image/jpeg;base64,dGh1bWI=',
            },
          });
          return;
        }

        if (request.type === 'EXTRACT_PREVIEW_CLIP') {
          callback({
            type: 'PREVIEW_CLIP_RESULT',
            requestId: request.requestId,
            payload: {
              candidateId: request.payload.candidateId,
              outputPath: 'C:\\Temp\\preview.webm',
              mimeType: 'video/webm',
              dataUrl: 'data:video/webm;base64,cHJldmlldw==',
            },
          });
          return;
        }

        if (request.type === 'CANCEL_JOB') {
          callback({
            type: 'CANCELLED',
            requestId: request.requestId,
            payload: { jobId: request.payload.jobId },
          });
          return;
        }

        if (request.type === 'CLEANUP_JOB') {
          callback({
            type: 'CLEANED_UP',
            requestId: request.requestId,
            payload: { jobId: request.payload.jobId },
          });
        }
      },
    });

    await expect(client.exportMedia(exportPayload)).resolves.toMatchObject({
      jobId: 'job-1',
      outputPath: 'C:\\Temp\\clip.mp4',
    });
    await expect(client.extractThumbnail(thumbnailPayload)).resolves.toMatchObject({
      candidateId: 'candidate-1',
      outputPath: 'C:\\Temp\\thumb.jpg',
    });
    await expect(client.extractPreviewClip(previewPayload)).resolves.toMatchObject({
      candidateId: 'candidate-1',
      outputPath: 'C:\\Temp\\preview.webm',
    });
    await expect(client.cancelJob('job-1')).resolves.toEqual({ jobId: 'job-1' });
    await expect(client.cleanupJob('job-1')).resolves.toEqual({ jobId: 'job-1' });

    expect(sentRequests).toEqual([
      expect.objectContaining({ type: 'EXPORT_MEDIA', payload: exportPayload }),
      expect.objectContaining({ type: 'EXTRACT_THUMBNAIL', payload: thumbnailPayload }),
      expect.objectContaining({ type: 'EXTRACT_PREVIEW_CLIP', payload: previewPayload }),
      expect.objectContaining({ type: 'CANCEL_JOB', payload: { jobId: 'job-1' } }),
      expect.objectContaining({ type: 'CLEANUP_JOB', payload: { jobId: 'job-1' } }),
    ]);
  });

  test('exportMedia streams PROGRESS over a persistent port before resolving COMPLETED', async () => {
    const progress: NativeFfmpegProgressPayload[] = [];
    let exportPort: FakePort | undefined;
    const connectNative: NativeConnectNative = (_hostName) =>
      createFakePort((request, port) => {
        exportPort = port;
        port.emit({
          type: 'PROGRESS',
          requestId: request.requestId,
          payload: { jobId: 'job-1', progressPct: 25, phase: 'exporting', timeSec: 2 },
        });
        port.emit({
          type: 'PROGRESS',
          requestId: request.requestId,
          payload: { jobId: 'job-1', progressPct: 75, phase: 'exporting', timeSec: 6 },
        });
        port.emit({
          type: 'COMPLETED',
          requestId: request.requestId,
          payload: { jobId: 'job-1', outputPath: 'C:\\Temp\\clip.mp4', mimeType: 'video/mp4' },
        });
      });

    const client = createNativeFfmpegClient({ connectNative });

    await expect(
      client.exportMedia(exportPayload, { onProgress: (event) => progress.push(event) }),
    ).resolves.toMatchObject({ jobId: 'job-1', outputPath: 'C:\\Temp\\clip.mp4' });

    expect(progress).toEqual([
      { jobId: 'job-1', progressPct: 25, phase: 'exporting', timeSec: 2 },
      { jobId: 'job-1', progressPct: 75, phase: 'exporting', timeSec: 6 },
    ]);
    expect(exportPort?.disconnected).toBe(true);
  });

  test('exportMedia surfaces helper ERROR delivered over the port', async () => {
    const connectNative: NativeConnectNative = () =>
      createFakePort((request, port) => {
        port.emit({
          type: 'ERROR',
          requestId: request.requestId,
          payload: { code: 'FFMPEG_NOT_FOUND', message: 'Install ffmpeg and try again.' },
        });
      });

    const client = createNativeFfmpegClient({ connectNative });

    await expect(client.exportMedia(exportPayload)).rejects.toMatchObject({
      code: 'FFMPEG_NOT_FOUND',
      message: 'Install ffmpeg and try again.',
    });
  });

  test('exportMedia rejects when the port disconnects before completion', async () => {
    const connectNative: NativeConnectNative = () =>
      createFakePort((_request, port) => {
        port.fail();
      });

    const client = createNativeFfmpegClient({ connectNative });

    await expect(client.exportMedia(exportPayload)).rejects.toMatchObject({
      code: 'NATIVE_UNAVAILABLE',
    });
  });

  test('export, thumbnail, preview, cancel, and cleanup commands use createNativeRequest', async () => {
    vi.resetModules();
    vi.doMock('../native-ffmpeg-contract', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../native-ffmpeg-contract')>();

      return {
        ...actual,
        createNativeRequest: vi.fn(actual.createNativeRequest),
      };
    });

    const contract = await import('../native-ffmpeg-contract');
    const { createNativeFfmpegClient } = await import('../native-ffmpeg-client');
    const client = createNativeFfmpegClient({
      sendNativeMessage: (_hostName, request, callback) => {
        if (request.type === 'EXPORT_MEDIA') {
          callback({
            type: 'COMPLETED',
            requestId: request.requestId,
            payload: { jobId: request.payload.jobId, outputPath: 'C:\\Temp\\clip.mp4' },
          });
          return;
        }

        if (request.type === 'EXTRACT_THUMBNAIL') {
          callback({
            type: 'THUMBNAIL_RESULT',
            requestId: request.requestId,
            payload: {
              candidateId: request.payload.candidateId,
              outputPath: 'C:\\Temp\\thumb.jpg',
              mimeType: 'image/jpeg',
              dataUrl: 'data:image/jpeg;base64,dGh1bWI=',
            },
          });
          return;
        }

        if (request.type === 'EXTRACT_PREVIEW_CLIP') {
          callback({
            type: 'PREVIEW_CLIP_RESULT',
            requestId: request.requestId,
            payload: {
              candidateId: request.payload.candidateId,
              outputPath: 'C:\\Temp\\preview.webm',
              mimeType: 'video/webm',
              dataUrl: 'data:video/webm;base64,cHJldmlldw==',
            },
          });
          return;
        }

        if (request.type === 'CANCEL_JOB') {
          callback({
            type: 'CANCELLED',
            requestId: request.requestId,
            payload: { jobId: request.payload.jobId },
          });
          return;
        }

        if (request.type === 'CLEANUP_JOB') {
          callback({
            type: 'CLEANED_UP',
            requestId: request.requestId,
            payload: { jobId: request.payload.jobId },
          });
        }
      },
    });

    await client.exportMedia(exportPayload);
    await client.extractThumbnail(thumbnailPayload);
    await client.extractPreviewClip(previewPayload);
    await client.cancelJob('job-1');
    await client.cleanupJob('job-1');

    expect(contract.createNativeRequest).toHaveBeenNthCalledWith(1, 'EXPORT_MEDIA', exportPayload);
    expect(contract.createNativeRequest).toHaveBeenNthCalledWith(2, 'EXTRACT_THUMBNAIL', thumbnailPayload);
    expect(contract.createNativeRequest).toHaveBeenNthCalledWith(
      3,
      'EXTRACT_PREVIEW_CLIP',
      previewPayload,
    );
    expect(contract.createNativeRequest).toHaveBeenNthCalledWith(4, 'CANCEL_JOB', { jobId: 'job-1' });
    expect(contract.createNativeRequest).toHaveBeenNthCalledWith(5, 'CLEANUP_JOB', { jobId: 'job-1' });
  });
});

const exportPayload: NativeFfmpegExportPayload = {
  jobId: 'job-1',
  inputUrl: 'https://cdn.example.com/video.mp4',
  protocol: 'direct',
  outputName: 'clip.mp4',
  outputKind: 'mp4',
  trim: { startSec: 1, endSec: 5 },
};

const thumbnailPayload: NativeFfmpegThumbnailPayload = {
  candidateId: 'candidate-1',
  inputUrl: 'https://cdn.example.com/video.mp4',
  atSec: 3,
  format: 'jpg',
};

const previewPayload: NativeFfmpegPreviewClipPayload = {
  candidateId: 'candidate-1',
  inputUrl: 'https://cdn.example.com/video.mp4',
  startSec: 4,
  durationSec: 3,
  format: 'webm',
};
