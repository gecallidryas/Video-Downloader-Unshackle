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
  it('returns PONG with helper version and runtime availability', async () => {
    const checkExecutable = vi.fn(async (file: 'ffmpeg' | 'ffprobe') => file === 'ffmpeg');
    const response = await dispatchNativeRequest(
      { type: 'PING', requestId: 'req-ping' },
      { checkExecutable, ensureOutputDirs: vi.fn().mockResolvedValue(dirs) },
    );

    expect(checkExecutable).toHaveBeenCalledWith('ffmpeg');
    expect(checkExecutable).toHaveBeenCalledWith('ffprobe');
    expect(response).toEqual({
      type: 'PONG',
      requestId: 'req-ping',
      payload: {
        version: '0.1.0',
        ffmpegAvailable: true,
        ffprobeAvailable: false,
        ytDlpAvailable: false,
        platform: process.platform,
        installKind: 'dev',
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

  it('emits framed PROGRESS messages then resolves COMPLETED for EXPORT_MEDIA', async () => {
    const runProcessJob = vi.fn(async (options: { jobId: string; onProgress?: (event: unknown) => void }) => {
      options.onProgress?.({
        type: 'PROGRESS',
        payload: { jobId: options.jobId, progressPct: 40, phase: 'exporting', timeSec: 4 },
      });
      options.onProgress?.({
        type: 'PROGRESS',
        payload: { jobId: options.jobId, progressPct: 100, phase: 'completed' },
      });
      return {
        jobId: options.jobId,
        outputPath: `${dirs.outputsDir}\\clip.mp4`,
        mimeType: 'video/mp4',
        sizeBytes: 2048,
      };
    });
    const emitted: unknown[] = [];

    const response = await dispatchNativeRequest(
      {
        type: 'EXPORT_MEDIA',
        requestId: 'req-progress',
        payload: {
          jobId: 'job-progress',
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
      (message) => emitted.push(message),
    );

    expect(emitted).toEqual([
      {
        type: 'PROGRESS',
        requestId: 'req-progress',
        payload: { jobId: 'job-progress', progressPct: 40, phase: 'exporting', timeSec: 4 },
      },
      {
        type: 'PROGRESS',
        requestId: 'req-progress',
        payload: { jobId: 'job-progress', progressPct: 100, phase: 'completed' },
      },
    ]);
    expect(response).toEqual({
      type: 'COMPLETED',
      requestId: 'req-progress',
      payload: {
        jobId: 'job-progress',
        outputPath: `${dirs.outputsDir}\\clip.mp4`,
        mimeType: 'video/mp4',
        sizeBytes: 2048,
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
      sizeBytes: 12345,
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
        sizeBytes: 12345,
      },
    });
  });

  it('dispatches READ_ASSET_BYTES with a strict byte cap', async () => {
    const response = await dispatchNativeRequest(
      {
        type: 'READ_ASSET_BYTES',
        requestId: 'req-read',
        payload: {
          outputPath: `${dirs.previewsDir}\\candidate-2.webm`,
          maxBytes: 1024,
        },
      },
      {
        readAsset: vi.fn().mockResolvedValue(Buffer.from('webm-bytes')),
      },
    );

    expect(response).toEqual({
      type: 'ASSET_BYTES_RESULT',
      requestId: 'req-read',
      payload: {
        outputPath: `${dirs.previewsDir}\\candidate-2.webm`,
        sizeBytes: 10,
        base64: 'd2VibS1ieXRlcw==',
      },
    });
  });

  it('dispatches a ranged READ_ASSET_BYTES slice with an eof flag past the cap', async () => {
    const fileBytes = Buffer.from('0123456789');
    const fileSize = fileBytes.byteLength;

    const readAssetRange = vi.fn(
      async (_path: string, offset: number, length: number) => {
        const toRead = Math.min(length, Math.max(0, fileSize - offset));
        return {
          buffer: fileBytes.subarray(offset, offset + toRead),
          bytesRead: toRead,
          fileSize,
        };
      },
    );

    const outputPath = `${dirs.previewsDir}\\big-output.mp4`;

    const first = await dispatchNativeRequest(
      { type: 'READ_ASSET_BYTES', requestId: 'r1', payload: { outputPath, maxBytes: 4, offset: 0 } },
      { readAssetRange },
    );
    const second = await dispatchNativeRequest(
      { type: 'READ_ASSET_BYTES', requestId: 'r2', payload: { outputPath, maxBytes: 4, offset: 8 } },
      { readAssetRange },
    );

    expect(first).toEqual({
      type: 'ASSET_BYTES_RESULT',
      requestId: 'r1',
      payload: { outputPath, sizeBytes: 4, base64: Buffer.from('0123').toString('base64'), eof: false },
    });
    expect(second).toEqual({
      type: 'ASSET_BYTES_RESULT',
      requestId: 'r2',
      payload: { outputPath, sizeBytes: 2, base64: Buffer.from('89').toString('base64'), eof: true },
    });
  });

  it('ranged READ_ASSET_BYTES does not call readAsset — only readAssetRange is invoked', async () => {
    const fileBytes = Buffer.from('hello world');
    const fileSize = fileBytes.byteLength;
    const readAsset = vi.fn();
    const readAssetRange = vi.fn(async (_path: string, offset: number, length: number) => ({
      buffer: fileBytes.subarray(offset, offset + length),
      bytesRead: Math.min(length, fileSize - offset),
      fileSize,
    }));
    const outputPath = `${dirs.previewsDir}\\check.mp4`;

    await dispatchNativeRequest(
      { type: 'READ_ASSET_BYTES', requestId: 'r-check', payload: { outputPath, maxBytes: 5, offset: 0 } },
      { readAsset, readAssetRange },
    );

    expect(readAsset).not.toHaveBeenCalled();
    expect(readAssetRange).toHaveBeenCalledWith(outputPath, 0, 5);
  });

  it('EXPORT_MEDIA threads expectedDurationSec from probe into runProcessJob', async () => {
    const runProbe = vi.fn().mockResolvedValue({ durationSec: 120 });
    const runProcessJob = vi.fn().mockResolvedValue({
      jobId: 'job-dur',
      outputPath: `${dirs.outputsDir}\\clip.mp4`,
      mimeType: 'video/mp4',
    });

    await dispatchNativeRequest(
      {
        type: 'EXPORT_MEDIA',
        requestId: 'req-dur',
        payload: {
          jobId: 'job-dur',
          inputUrl: 'https://media.example.test/video.mp4',
          protocol: 'direct',
          outputName: 'clip.mp4',
          outputKind: 'mp4',
        },
      },
      {
        checkExecutable: vi.fn().mockResolvedValue(true),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
        runProbe,
        runProcessJob,
      },
    );

    expect(runProbe).toHaveBeenCalled();
    expect(runProcessJob).toHaveBeenCalledWith(
      expect.objectContaining({ expectedDurationSec: 120 }),
    );
  });

  it('EXPORT_MEDIA proceeds without expectedDurationSec when probe fails', async () => {
    const runProbe = vi.fn().mockRejectedValue(new Error('ffprobe unavailable'));
    const runProcessJob = vi.fn().mockResolvedValue({
      jobId: 'job-probe-fail',
      outputPath: `${dirs.outputsDir}\\clip.mp4`,
      mimeType: 'video/mp4',
    });

    const response = await dispatchNativeRequest(
      {
        type: 'EXPORT_MEDIA',
        requestId: 'req-probe-fail',
        payload: {
          jobId: 'job-probe-fail',
          inputUrl: 'https://media.example.test/video.mp4',
          protocol: 'direct',
          outputName: 'clip.mp4',
          outputKind: 'mp4',
        },
      },
      {
        checkExecutable: vi.fn().mockResolvedValue(true),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
        runProbe,
        runProcessJob,
      },
    );

    expect(response.type).toBe('COMPLETED');
    expect(runProcessJob).toHaveBeenCalledWith(
      expect.objectContaining({ expectedDurationSec: undefined }),
    );
  });

  it('rejects EXPORT_MEDIA with unknown protocol as INVALID_REQUEST', async () => {
    const response = await dispatchNativeRequest({
      type: 'EXPORT_MEDIA',
      requestId: 'req-proto',
      payload: {
        jobId: 'job-proto',
        inputUrl: 'https://media.example.test/video.mp4',
        protocol: 'ftp',
        outputName: 'clip.mp4',
        outputKind: 'mp4',
      },
    });

    expect(response).toEqual({
      type: 'ERROR',
      requestId: 'req-proto',
      payload: { code: 'INVALID_REQUEST', message: expect.stringContaining('Invalid native ffmpeg request') },
    });
  });

  it('rejects EXPORT_MEDIA with unknown outputKind as INVALID_REQUEST', async () => {
    const response = await dispatchNativeRequest({
      type: 'EXPORT_MEDIA',
      requestId: 'req-kind',
      payload: {
        jobId: 'job-kind',
        inputUrl: 'https://media.example.test/video.mp4',
        protocol: 'direct',
        outputName: 'clip.mov',
        outputKind: 'mov',
      },
    });

    expect(response).toEqual({
      type: 'ERROR',
      requestId: 'req-kind',
      payload: { code: 'INVALID_REQUEST', message: expect.stringContaining('Invalid native ffmpeg request') },
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

  it('emits framed PROGRESS then COMPLETED for EXPORT_YTDLP', async () => {
    const runYtDlpJob = vi.fn(async (options: { jobId: string; plan: { outputPath: string }; onProgress?: (event: unknown) => void }) => {
      options.onProgress?.({ type: 'PROGRESS', payload: { jobId: options.jobId, progressPct: 30, phase: 'fetching' } });
      options.onProgress?.({ type: 'PROGRESS', payload: { jobId: options.jobId, progressPct: 100, phase: 'completed' } });
      return { jobId: options.jobId, outputPath: options.plan.outputPath, mimeType: 'video/mp4', sizeBytes: 4096 };
    });
    const emitted: unknown[] = [];

    const response = await dispatchNativeRequest(
      {
        type: 'EXPORT_YTDLP',
        requestId: 'req-ytdlp',
        payload: {
          jobId: 'job-ytdlp',
          inputUrl: 'https://example.com/watch?v=abc',
          outputName: 'clip.mp4',
          quality: 'best-mp4',
        },
      },
      {
        checkExecutable: vi.fn().mockResolvedValue(true),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
        runYtDlpJob,
      },
      (message) => emitted.push(message),
    );

    expect(runYtDlpJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-ytdlp',
        plan: expect.objectContaining({
          file: 'yt-dlp',
          outputPath: `${dirs.outputsDir}\\clip.mp4`,
          args: expect.arrayContaining(['--no-playlist', '-o', `${dirs.outputsDir}\\clip.mp4`, '--', 'https://example.com/watch?v=abc']),
        }),
      }),
    );
    expect(emitted).toEqual([
      { type: 'PROGRESS', requestId: 'req-ytdlp', payload: { jobId: 'job-ytdlp', progressPct: 30, phase: 'fetching' } },
      { type: 'PROGRESS', requestId: 'req-ytdlp', payload: { jobId: 'job-ytdlp', progressPct: 100, phase: 'completed' } },
    ]);
    expect(response).toEqual({
      type: 'COMPLETED',
      requestId: 'req-ytdlp',
      payload: { jobId: 'job-ytdlp', outputPath: `${dirs.outputsDir}\\clip.mp4`, mimeType: 'video/mp4', sizeBytes: 4096 },
    });
  });

  it('attaches enumerated sidecar subtitle outputs to COMPLETED when writeSubtitles is set', async () => {
    const runYtDlpJob = vi.fn(async (options: { jobId: string; plan: { outputPath: string } }) => ({
      jobId: options.jobId,
      outputPath: options.plan.outputPath,
      mimeType: 'video/mp4',
      sizeBytes: 4096,
    }));
    const readSidecarOutputs = vi.fn().mockResolvedValue([
      { outputPath: `${dirs.outputsDir}\\clip.en.vtt`, fileName: 'clip.en.vtt', mimeType: 'text/vtt', sizeBytes: 12 },
    ]);

    const response = await dispatchNativeRequest(
      {
        type: 'EXPORT_YTDLP',
        requestId: 'req-ytdlp-subs',
        payload: {
          jobId: 'job-subs',
          inputUrl: 'https://example.com/watch',
          outputName: 'clip.mp4',
          quality: 'best',
          subtitleLanguages: ['en'],
          writeSubtitles: true,
        },
      },
      {
        checkExecutable: vi.fn().mockResolvedValue(true),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
        runYtDlpJob,
        readSidecarOutputs,
      },
    );

    expect(readSidecarOutputs).toHaveBeenCalledWith(`${dirs.outputsDir}\\clip.mp4`);
    expect(response).toEqual({
      type: 'COMPLETED',
      requestId: 'req-ytdlp-subs',
      payload: {
        jobId: 'job-subs',
        outputPath: `${dirs.outputsDir}\\clip.mp4`,
        mimeType: 'video/mp4',
        sizeBytes: 4096,
        sidecarOutputs: [
          { outputPath: `${dirs.outputsDir}\\clip.en.vtt`, fileName: 'clip.en.vtt', mimeType: 'text/vtt', sizeBytes: 12 },
        ],
      },
    });
  });

  it('does not enumerate sidecars when writeSubtitles is absent', async () => {
    const runYtDlpJob = vi.fn(async (options: { jobId: string; plan: { outputPath: string } }) => ({
      jobId: options.jobId,
      outputPath: options.plan.outputPath,
      mimeType: 'video/mp4',
    }));
    const readSidecarOutputs = vi.fn();

    await dispatchNativeRequest(
      {
        type: 'EXPORT_YTDLP',
        requestId: 'req-ytdlp-nosubs',
        payload: { jobId: 'j', inputUrl: 'https://example.com/watch', outputName: 'clip.mp4', quality: 'best' },
      },
      {
        checkExecutable: vi.fn().mockResolvedValue(true),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
        runYtDlpJob,
        readSidecarOutputs,
      },
    );

    expect(readSidecarOutputs).not.toHaveBeenCalled();
  });

  it('returns YTDLP_NOT_FOUND when the yt-dlp binary is missing', async () => {
    const response = await dispatchNativeRequest(
      {
        type: 'EXPORT_YTDLP',
        requestId: 'req-ytdlp-missing',
        payload: {
          jobId: 'job-ytdlp-missing',
          inputUrl: 'https://example.com/watch',
          outputName: 'clip.mp4',
          quality: 'best',
        },
      },
      {
        checkExecutable: vi.fn(async (file: 'ffmpeg' | 'ffprobe' | 'yt-dlp') => file !== 'yt-dlp'),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
      },
    );

    expect(response).toEqual({
      type: 'ERROR',
      requestId: 'req-ytdlp-missing',
      payload: { code: 'YTDLP_NOT_FOUND', message: expect.stringContaining('yt-dlp') },
    });
  });

  it('maps a yt-dlp non-zero exit to a typed ERROR without leaking stderr', async () => {
    const secretCookie = 'session=leaked-cookie-value';
    const runYtDlpJob = vi.fn().mockRejectedValue(
      Object.assign(new Error('yt-dlp exited with code 1.'), {
        name: 'YtDlpRunnerError',
        code: 'YTDLP_FAILED',
        stderr: `ERROR: forbidden\ncookie: ${secretCookie}`,
      }),
    );

    const response = await dispatchNativeRequest(
      {
        type: 'EXPORT_YTDLP',
        requestId: 'req-ytdlp-fail',
        payload: {
          jobId: 'job-ytdlp-fail',
          inputUrl: 'https://example.com/watch',
          outputName: 'clip.mp4',
          quality: 'best',
          headers: { Cookie: secretCookie },
        },
      },
      {
        checkExecutable: vi.fn().mockResolvedValue(true),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
        runYtDlpJob,
      },
    );

    expect(response.type).toBe('ERROR');
    expect(response).toEqual({
      type: 'ERROR',
      requestId: 'req-ytdlp-fail',
      payload: { code: 'YTDLP_FAILED', message: 'yt-dlp exited with code 1.' },
    });
    expect(JSON.stringify(response)).not.toContain(secretCookie);
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

  it('Cookie and Authorization values from headers do not appear in HELPER_ERROR message when process fails', async () => {
    const secretCookie = 'session=leaked-cookie-value';
    const secretAuth = 'Bearer leaked-auth-token';

    // Simulate a process failure whose .message does NOT contain credential values.
    // The ProcessRunnerError.stderr may contain them (ffmpeg echoes request headers on error),
    // but only .message must reach the ERROR response payload.
    const runProcessJob = vi.fn().mockRejectedValue(
      Object.assign(new Error('Process exited with code 1.'), {
        name: 'ProcessRunnerError',
        code: 'PROCESS_FAILED',
        stderr: `ffmpeg error output\ncookie: ${secretCookie}\nauthorization: ${secretAuth}`,
      }),
    );

    // dispatchExport is not awaited inside the switch, so a rejection from runProcessJob
    // propagates out of dispatchNativeRequest rather than being caught by the inner try/catch.
    // The top-level error message is the Error.message — never the stderr.
    const rejection = dispatchNativeRequest(
      {
        type: 'EXPORT_MEDIA',
        requestId: 'req-cred-leak',
        payload: {
          jobId: 'job-cred-leak',
          inputUrl: 'https://media.example.test/video.mp4',
          protocol: 'direct',
          outputName: 'clip.mp4',
          outputKind: 'mp4',
          headers: { cookie: secretCookie, authorization: secretAuth },
        },
      },
      {
        checkExecutable: vi.fn().mockResolvedValue(true),
        ensureOutputDirs: vi.fn().mockResolvedValue(dirs),
        runProbe: vi.fn().mockResolvedValue({ durationSec: 10 }),
        runProcessJob,
      },
    );

    await expect(rejection).rejects.toThrow();
    const error = await rejection.catch((e: unknown) => e as Error);
    expect(error.message).not.toContain(secretCookie);
    expect(error.message).not.toContain(secretAuth);
  });
});
