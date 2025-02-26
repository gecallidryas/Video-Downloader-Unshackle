import { describe, expect, it, vi } from 'vitest';
import { dispatchNativeRequest } from '../dispatcher';
import { JobRegistry } from '../job-registry';

const dirs = {
  baseDir: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle',
  outputsDir: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs',
  previewsDir: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\previews',
  thumbsDir: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\thumbs',
  tmpDir: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\tmp',
};

describe('native ffmpeg helper dispatcher', () => {
  it('returns PONG with helper version and ffmpeg availability', async () => {
    const response = await dispatchNativeRequest(
      { type: 'PING', requestId: 'req-ping' },
      { checkExecutable: vi.fn().mockResolvedValue(true), ensureOutputDirs: vi.fn().mockResolvedValue(dirs) },
    );

    expect(response).toEqual({
      type: 'PONG',
      requestId: 'req-ping',
      payload: {
        version: '0.1.0',
        ffmpegAvailable: true,
      },
    });
  });

  it('dispatches PROBE through ffprobe', async () => {
    const runProbe = vi.fn().mockResolvedValue({
      durationSec: 12,
      width: 640,
      height: 360,
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      codecs: ['h264', 'aac'],
    });

    const response = await dispatchNativeRequest(
      {
        type: 'PROBE',
        requestId: 'req-probe',
        payload: { inputUrl: 'https://media.example.test/video.mp4' },
      },
      {
        checkExecutable: vi.fn().mockResolvedValue(true),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
        runProbe,
      },
    );

    expect(runProbe).toHaveBeenCalledWith(
      expect.objectContaining({
        file: 'ffprobe',
        args: expect.arrayContaining(['https://media.example.test/video.mp4']),
      }),
    );
    expect(response).toEqual({
      type: 'PROBE_RESULT',
      requestId: 'req-probe',
      payload: expect.objectContaining({ durationSec: 12, width: 640, height: 360 }),
    });
  });

  it('dispatches EXPORT_MEDIA to a helper-owned output path and returns metadata', async () => {
    const runProcessJob = vi.fn().mockResolvedValue({
      jobId: 'job-export',
      outputPath: `${dirs.outputsDir}\\clip.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: 1234,
    });

    const response = await dispatchNativeRequest(
      {
        type: 'EXPORT_MEDIA',
        requestId: 'req-export',
        payload: {
          jobId: 'job-export',
          inputUrl: 'https://media.example.test/video.mp4',
          protocol: 'direct',
          outputName: 'clip.mp4',
          outputKind: 'mp4',
        },
      },
      {
        checkExecutable: vi.fn().mockResolvedValue(true),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
        runProcessJob,
      },
    );

    expect(runProcessJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-export',
        outputPath: `${dirs.outputsDir}\\clip.mp4`,
        mimeType: 'video/mp4',
      }),
    );
    expect(response).toEqual({
      type: 'COMPLETED',
      requestId: 'req-export',
      payload: {
        jobId: 'job-export',
        outputPath: `${dirs.outputsDir}\\clip.mp4`,
        mimeType: 'video/mp4',
        sizeBytes: 1234,
      },
    });
  });

  it('dispatches EXTRACT_THUMBNAIL to the thumbs directory', async () => {
    const runProcessJob = vi.fn().mockResolvedValue({
      jobId: 'thumb-candidate-1',
      outputPath: `${dirs.thumbsDir}\\candidate-1.jpg`,
      mimeType: 'image/jpeg',
    });

    const response = await dispatchNativeRequest(
      {
        type: 'EXTRACT_THUMBNAIL',
        requestId: 'req-thumb',
        payload: {
          candidateId: 'candidate-1',
          inputUrl: 'https://media.example.test/video.mp4',
          atSec: 2,
          format: 'jpg',
        },
      },
      {
        checkExecutable: vi.fn().mockResolvedValue(true),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
        runProcessJob,
        readAsset: vi.fn().mockResolvedValue(Buffer.from('jpg-bytes')),
      },
    );

    expect(response).toEqual({
      type: 'THUMBNAIL_RESULT',
      requestId: 'req-thumb',
      payload: {
        candidateId: 'candidate-1',
        outputPath: `${dirs.thumbsDir}\\candidate-1.jpg`,
        mimeType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,anBnLWJ5dGVz',
      },
    });
  });

  it('dispatches EXTRACT_PREVIEW_CLIP to the previews directory', async () => {
    const runProcessJob = vi.fn().mockResolvedValue({
      jobId: 'preview-candidate-2',
      outputPath: `${dirs.previewsDir}\\candidate-2.webm`,
      mimeType: 'video/webm',
    });

    const response = await dispatchNativeRequest(
      {
        type: 'EXTRACT_PREVIEW_CLIP',
        requestId: 'req-preview',
        payload: {
          candidateId: 'candidate-2',
          inputUrl: 'https://media.example.test/video.mp4',
          durationSec: 3,
          format: 'webm',
        },
      },
      {
        checkExecutable: vi.fn().mockResolvedValue(true),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
        runProcessJob,
        readAsset: vi.fn().mockResolvedValue(Buffer.from('webm-bytes')),
      },
    );

    expect(response).toEqual({
      type: 'PREVIEW_CLIP_RESULT',
      requestId: 'req-preview',
      payload: {
        candidateId: 'candidate-2',
        outputPath: `${dirs.previewsDir}\\candidate-2.webm`,
        mimeType: 'video/webm',
        dataUrl: 'data:video/webm;base64,d2VibS1ieXRlcw==',
      },
    });
  });

  it('dispatches CANCEL_JOB and CLEANUP_JOB through the job registry', async () => {
    const registry = new JobRegistry();
    const process = { kill: vi.fn(() => true), on: vi.fn(), once: vi.fn(), emit: vi.fn() };
    registry.register('job-active', process);

    const cancelled = await dispatchNativeRequest(
      { type: 'CANCEL_JOB', requestId: 'req-cancel', payload: { jobId: 'job-active' } },
      { registry },
    );
    const cleaned = await dispatchNativeRequest(
      { type: 'CLEANUP_JOB', requestId: 'req-clean', payload: { jobId: 'job-active' } },
      { registry },
    );

    expect(process.kill).toHaveBeenCalled();
    expect(cleaned).toEqual({ type: 'CLEANED_UP', requestId: 'req-clean', payload: { jobId: 'job-active' } });
    expect(cancelled).toEqual({ type: 'CANCELLED', requestId: 'req-cancel', payload: { jobId: 'job-active' } });
  });

  it('returns INVALID_REQUEST for malformed commands', async () => {
    const response = await dispatchNativeRequest({ type: 'EXPORT_MEDIA', requestId: 'req-bad' });

    expect(response).toEqual({
      type: 'ERROR',
      requestId: 'req-bad',
      payload: {
        code: 'INVALID_REQUEST',
        message: expect.stringContaining('Invalid native ffmpeg request'),
      },
    });
  });

  it('returns FFMPEG_NOT_FOUND when ffmpeg is missing', async () => {
    const response = await dispatchNativeRequest(
      {
        type: 'EXPORT_MEDIA',
        requestId: 'req-missing',
        payload: {
          jobId: 'job-missing',
          inputUrl: 'https://media.example.test/video.mp4',
          protocol: 'direct',
          outputName: 'clip.mp4',
          outputKind: 'mp4',
        },
      },
      {
        checkExecutable: vi.fn().mockResolvedValue(false),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
      },
    );

    expect(response).toEqual({
      type: 'ERROR',
      requestId: 'req-missing',
      payload: {
        code: 'FFMPEG_NOT_FOUND',
        message: expect.stringContaining('ffmpeg'),
      },
    });
  });
});
