import { describe, expect, test } from 'vitest';
import {
  createNativeRequest,
  isNativeFfmpegRequest,
  isNativeFfmpegResponse,
  nativeError,
} from '../native-ffmpeg-contract';

describe('native ffmpeg message contract', () => {
  test('accepts PING requests without a payload', () => {
    const request = createNativeRequest('PING', undefined, 'req-ping');

    expect(request).toEqual({ type: 'PING', requestId: 'req-ping' });
    expect(isNativeFfmpegRequest(request)).toBe(true);
  });

  test('accepts PROBE requests with an input URL', () => {
    const request = createNativeRequest(
      'PROBE',
      { inputUrl: 'https://cdn.example.com/master.m3u8' },
      'req-probe',
    );

    expect(isNativeFfmpegRequest(request)).toBe(true);
  });

  test('accepts EXPORT_MEDIA requests with required output settings', () => {
    const request = createNativeRequest(
      'EXPORT_MEDIA',
      {
        jobId: 'job-1',
        inputUrl: 'https://cdn.example.com/video.mp4',
        protocol: 'direct',
        outputName: 'video.mp4',
        outputKind: 'mp4',
        trim: { startSec: 1, endSec: 4 },
        headers: { Referer: 'https://example.com/watch' },
      },
      'req-export',
    );

    expect(isNativeFfmpegRequest(request)).toBe(true);
  });

  test('accepts MKV export requests for subtitle mux outputs', () => {
    const request = createNativeRequest(
      'EXPORT_MEDIA',
      {
        jobId: 'job-1',
        inputUrl: 'https://cdn.example.com/master.m3u8',
        protocol: 'hls',
        outputName: 'video.mkv',
        outputKind: 'mkv',
      },
      'req-export-mkv',
    );

    expect(isNativeFfmpegRequest(request)).toBe(true);
  });

  test('accepts EXTRACT_THUMBNAIL requests with candidate and seek details', () => {
    const request = createNativeRequest(
      'EXTRACT_THUMBNAIL',
      {
        candidateId: 'candidate-1',
        inputUrl: 'https://cdn.example.com/video.mp4',
        atSec: 2,
        format: 'jpg',
      },
      'req-thumb',
    );

    expect(isNativeFfmpegRequest(request)).toBe(true);
  });

  test('accepts EXTRACT_PREVIEW_CLIP requests with bounded clip details', () => {
    const request = createNativeRequest(
      'EXTRACT_PREVIEW_CLIP',
      {
        candidateId: 'candidate-1',
        inputUrl: 'https://cdn.example.com/video.mp4',
        startSec: 3,
        durationSec: 5,
        format: 'webm',
      },
      'req-preview',
    );

    expect(isNativeFfmpegRequest(request)).toBe(true);
  });

  test('accepts EXTRACT_PREVIEW_CLIP requests with safe request headers', () => {
    const request = createNativeRequest(
      'EXTRACT_PREVIEW_CLIP',
      {
        candidateId: 'candidate-1',
        inputUrl: 'https://cdn.example.com/video.mp4',
        startSec: 3,
        durationSec: 5,
        format: 'webm',
        headers: { referer: 'https://example.com/watch', origin: 'https://example.com' },
      },
      'req-preview-headers',
    );

    expect(isNativeFfmpegRequest(request)).toBe(true);
  });

  test('accepts CANCEL_JOB requests with a job id', () => {
    const request = createNativeRequest('CANCEL_JOB', { jobId: 'job-1' }, 'req-cancel');

    expect(isNativeFfmpegRequest(request)).toBe(true);
  });

  test('accepts CLEANUP_JOB requests with a job id', () => {
    const request = createNativeRequest('CLEANUP_JOB', { jobId: 'job-1' }, 'req-cleanup');

    expect(isNativeFfmpegRequest(request)).toBe(true);
  });

  test('accepts valid progress response messages', () => {
    expect(
      isNativeFfmpegResponse({
        type: 'PROGRESS',
        requestId: 'req-export',
        payload: {
          jobId: 'job-1',
          progressPct: 42,
          phase: 'transmuxing',
          timeSec: 12.5,
        },
      }),
    ).toBe(true);
  });

  test('accepts PONG responses with helper self-test diagnostics', () => {
    expect(
      isNativeFfmpegResponse({
        type: 'PONG',
        requestId: 'req-ping',
        payload: {
          version: '0.1.0',
          ffmpegAvailable: true,
          ffprobeAvailable: false,
          platform: 'win32',
          installKind: 'per-user',
        },
      }),
    ).toBe(true);
  });

  test('accepts preview asset responses with extension-safe data URLs', () => {
    expect(
      isNativeFfmpegResponse({
        type: 'PREVIEW_CLIP_RESULT',
        requestId: 'req-preview',
        payload: {
          candidateId: 'candidate-1',
          outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\previews\\candidate-1.webm',
          mimeType: 'video/webm',
          dataUrl: 'data:video/webm;base64,d2VibS1ieXRlcw==',
        },
      }),
    ).toBe(true);
  });

  test('creates native error responses', () => {
    expect(nativeError('INVALID_REQUEST', 'Missing payload', 'req-bad')).toEqual({
      type: 'ERROR',
      requestId: 'req-bad',
      payload: {
        code: 'INVALID_REQUEST',
        message: 'Missing payload',
      },
    });
  });

  test('rejects invalid requests and responses', () => {
    expect(isNativeFfmpegRequest(null)).toBe(false);
    expect(isNativeFfmpegRequest({ type: 'PING' })).toBe(false);
    expect(
      isNativeFfmpegRequest({
        type: 'EXPORT_MEDIA',
        requestId: 'req-export',
        payload: {
          jobId: 'job-1',
          inputUrl: 'https://cdn.example.com/video.mp4',
          protocol: 'direct',
          outputName: 'video.mp4',
          outputKind: 'mov',
        },
      }),
    ).toBe(false);
    expect(
      isNativeFfmpegRequest({
        type: 'EXPORT_MEDIA',
        requestId: 'req-export',
        payload: {
          jobId: 'job-1',
          inputUrl: 'https://cdn.example.com/video.mp4',
          protocol: 'direct',
          outputName: 'video.mp4',
          outputKind: 'mp4',
          trim: { startSec: 10, endSec: 5 },
        },
      }),
    ).toBe(false);
    expect(
      isNativeFfmpegRequest({
        type: 'EXPORT_MEDIA',
        requestId: 'req-export',
        payload: {
          jobId: 'job-1',
          inputUrl: 'https://cdn.example.com/video.mp4',
          protocol: 'direct',
          outputName: 'video.mp4',
          outputKind: 'mp4',
          command: 'ffmpeg -i input output',
        },
      }),
    ).toBe(false);
    expect(
      isNativeFfmpegRequest({
        type: 'EXTRACT_PREVIEW_CLIP',
        requestId: 'req-preview',
        payload: {
          candidateId: 'candidate-1',
          inputUrl: 'https://cdn.example.com/video.mp4',
          durationSec: 5,
          format: 'webm',
          command: 'ffmpeg -i input output',
        },
      }),
    ).toBe(false);
    expect(
      isNativeFfmpegResponse({
        type: 'PROGRESS',
        requestId: 'req-export',
        payload: { jobId: 'job-1', progressPct: 140, phase: 'exporting' },
      }),
    ).toBe(false);
    expect(
      isNativeFfmpegResponse({
        type: 'PONG',
        requestId: 'req-ping',
        payload: { version: '0.1.0', ffmpegAvailable: true },
      }),
    ).toBe(false);
    expect(
      isNativeFfmpegResponse({
        type: 'THUMBNAIL_RESULT',
        requestId: 'req-thumb',
        payload: {
          candidateId: 'candidate-1',
          outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\thumbs\\candidate-1.jpg',
          mimeType: 'image/jpeg',
        },
      }),
    ).toBe(false);
  });
});
