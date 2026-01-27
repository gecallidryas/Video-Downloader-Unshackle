import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import type { NativeJson } from './native-protocol.js';
import {
  buildExportArgs,
  buildPreviewClipArgs,
  buildProbeArgs,
  buildThumbnailArgs,
  type FfmpegCommandPlan,
  type FfmpegExportPayload,
  type FfmpegPreviewClipPayload,
  type FfmpegThumbnailPayload,
} from './ffmpeg-command.js';
import { defaultJobRegistry, type JobRegistry } from './job-registry.js';
import { ensureHelperOutputDirs, helperOwnedPath, type HelperOutputDirs } from './output-paths.js';
import { runProcessJob, type ProcessJobResult, type RunProcessJobOptions } from './process-runner.js';

const HELPER_VERSION = '0.1.0';

type RequestRecord = Record<string, unknown>;

export type NativeHelperRequest =
  | { type: 'PING'; requestId: string }
  | { type: 'PROBE'; requestId: string; payload: { inputUrl: string } }
  | { type: 'EXPORT_MEDIA'; requestId: string; payload: FfmpegExportPayload }
  | { type: 'EXTRACT_THUMBNAIL'; requestId: string; payload: FfmpegThumbnailPayload }
  | { type: 'EXTRACT_PREVIEW_CLIP'; requestId: string; payload: FfmpegPreviewClipPayload }
  | { type: 'CANCEL_JOB'; requestId: string; payload: { jobId: string } }
  | { type: 'CLEANUP_JOB'; requestId: string; payload: { jobId: string } };

export type NativeHelperResponse =
  | {
      type: 'PONG';
      requestId: string;
      payload: {
        version: string;
        ffmpegAvailable: boolean;
        ffprobeAvailable: boolean;
        platform: string;
        installKind?: 'dev' | 'per-user' | 'system';
      };
    }
  | { type: 'PROBE_RESULT'; requestId: string; payload: ProbeResult }
  | { type: 'COMPLETED'; requestId: string; payload: ProcessJobResult }
  | { type: 'THUMBNAIL_RESULT'; requestId: string; payload: AssetResultPayload }
  | { type: 'PREVIEW_CLIP_RESULT'; requestId: string; payload: AssetResultPayload }
  | { type: 'CANCELLED'; requestId: string; payload: { jobId: string } }
  | { type: 'CLEANED_UP'; requestId: string; payload: { jobId: string } }
  | { type: 'ERROR'; requestId: string; payload: { code: string; message: string; detail?: NativeJson } };

export type ProbeResult = {
  durationSec?: number;
  width?: number;
  height?: number;
  formatName?: string;
  codecs?: string[];
};

type AssetResultPayload = {
  candidateId: string;
  outputPath: string;
  mimeType: string;
  dataUrl: string;
};

export type DispatcherDeps = {
  checkExecutable?: (file: 'ffmpeg' | 'ffprobe') => Promise<boolean>;
  ensureOutputDirs?: () => Promise<HelperOutputDirs>;
  runProbe?: (plan: FfmpegCommandPlan) => Promise<ProbeResult>;
  runProcessJob?: (options: RunProcessJobOptions) => Promise<ProcessJobResult>;
  readAsset?: (outputPath: string) => Promise<Buffer | Uint8Array>;
  registry?: JobRegistry;
};

export async function dispatchNativeRequest(
  request: unknown,
  deps: DispatcherDeps = {},
): Promise<NativeHelperResponse> {
  const requestId = requestIdFrom(request);

  if (!isNativeHelperRequest(request)) {
    return errorResponse(requestId, 'INVALID_REQUEST', 'Invalid native ffmpeg request.');
  }

  try {
    switch (request.type) {
      case 'PING':
        return {
          type: 'PONG',
          requestId: request.requestId,
          payload: {
            version: HELPER_VERSION,
            ffmpegAvailable: await checkExecutable('ffmpeg', deps),
            ffprobeAvailable: await checkExecutable('ffprobe', deps),
            platform: process.platform,
            installKind: nativeInstallKind(),
          },
        };

      case 'PROBE':
        if (!(await checkExecutable('ffprobe', deps))) {
          return errorResponse(request.requestId, 'FFMPEG_NOT_FOUND', 'ffprobe was not found on PATH.');
        }
        return {
          type: 'PROBE_RESULT',
          requestId: request.requestId,
          payload: await (deps.runProbe ?? runProbe)(buildProbeArgs(request.payload.inputUrl)),
        };

      case 'EXPORT_MEDIA':
        if (!(await checkExecutable('ffmpeg', deps))) {
          return errorResponse(request.requestId, 'FFMPEG_NOT_FOUND', 'ffmpeg was not found on PATH.');
        }
        return dispatchExport(request, deps);

      case 'EXTRACT_THUMBNAIL':
        if (!(await checkExecutable('ffmpeg', deps))) {
          return errorResponse(request.requestId, 'FFMPEG_NOT_FOUND', 'ffmpeg was not found on PATH.');
        }
        return dispatchThumbnail(request, deps);

      case 'EXTRACT_PREVIEW_CLIP':
        if (!(await checkExecutable('ffmpeg', deps))) {
          return errorResponse(request.requestId, 'FFMPEG_NOT_FOUND', 'ffmpeg was not found on PATH.');
        }
        return dispatchPreview(request, deps);

      case 'CANCEL_JOB':
        (deps.registry ?? defaultJobRegistry).cancel(request.payload.jobId);
        return { type: 'CANCELLED', requestId: request.requestId, payload: request.payload };

      case 'CLEANUP_JOB':
        (deps.registry ?? defaultJobRegistry).cleanup(request.payload.jobId);
        return { type: 'CLEANED_UP', requestId: request.requestId, payload: request.payload };
    }
  } catch (error) {
    return errorResponse(
      request.requestId,
      'HELPER_ERROR',
      error instanceof Error ? error.message : 'Unknown native helper error.',
    );
  }
}

function nativeInstallKind(): 'dev' | 'per-user' | 'system' | undefined {
  const value = process.env.UNSHACKLE_NATIVE_INSTALL_KIND;
  return value === 'per-user' || value === 'system' || value === 'dev' ? value : 'dev';
}

async function dispatchExport(
  request: Extract<NativeHelperRequest, { type: 'EXPORT_MEDIA' }>,
  deps: DispatcherDeps,
): Promise<NativeHelperResponse> {
  const dirs = await ensureDirs(deps);
  const outputPath = helperOwnedPath(dirs, 'outputs', request.payload.outputName, extensionForOutput(request.payload));
  const result = await (deps.runProcessJob ?? runProcessJob)({
    jobId: request.payload.jobId,
    plan: buildExportArgs(request.payload, outputPath),
    outputPath,
    mimeType: mimeForOutput(request.payload),
    registry: deps.registry,
  });

  return { type: 'COMPLETED', requestId: request.requestId, payload: result };
}

async function dispatchThumbnail(
  request: Extract<NativeHelperRequest, { type: 'EXTRACT_THUMBNAIL' }>,
  deps: DispatcherDeps,
): Promise<NativeHelperResponse> {
  const dirs = await ensureDirs(deps);
  const outputPath = helperOwnedPath(dirs, 'thumbs', request.payload.candidateId, request.payload.format);
  const mimeType = mimeForThumbnail(request.payload.format);

  await (deps.runProcessJob ?? runProcessJob)({
    jobId: `thumb-${request.payload.candidateId}`,
    plan: buildThumbnailArgs(request.payload, outputPath),
    outputPath,
    mimeType,
    registry: deps.registry,
  });

  return {
    type: 'THUMBNAIL_RESULT',
    requestId: request.requestId,
    payload: {
      candidateId: request.payload.candidateId,
      outputPath,
      mimeType,
      dataUrl: await buildAssetDataUrl(outputPath, mimeType, deps),
    },
  };
}

async function dispatchPreview(
  request: Extract<NativeHelperRequest, { type: 'EXTRACT_PREVIEW_CLIP' }>,
  deps: DispatcherDeps,
): Promise<NativeHelperResponse> {
  const dirs = await ensureDirs(deps);
  const outputPath = helperOwnedPath(dirs, 'previews', request.payload.candidateId, request.payload.format);
  const mimeType = mimeForPreview(request.payload.format);

  await (deps.runProcessJob ?? runProcessJob)({
    jobId: `preview-${request.payload.candidateId}`,
    plan: buildPreviewClipArgs(request.payload, outputPath),
    outputPath,
    expectedDurationSec: request.payload.durationSec,
    mimeType,
    registry: deps.registry,
  });

  return {
    type: 'PREVIEW_CLIP_RESULT',
    requestId: request.requestId,
    payload: {
      candidateId: request.payload.candidateId,
      outputPath,
      mimeType,
      dataUrl: await buildAssetDataUrl(outputPath, mimeType, deps),
    },
  };
}

async function buildAssetDataUrl(
  outputPath: string,
  mimeType: string,
  deps: DispatcherDeps,
): Promise<string> {
  const bytes = await (deps.readAsset ?? readFile)(outputPath);
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

async function ensureDirs(deps: DispatcherDeps): Promise<HelperOutputDirs> {
  return (deps.ensureOutputDirs ?? ensureHelperOutputDirs)();
}

async function checkExecutable(file: 'ffmpeg' | 'ffprobe', deps: DispatcherDeps): Promise<boolean> {
  return (deps.checkExecutable ?? defaultCheckExecutable)(file);
}

function defaultCheckExecutable(file: 'ffmpeg' | 'ffprobe'): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(file, ['-version'], { shell: false, windowsHide: true, stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('close', (code) => resolve(code === 0));
  });
}

function runProbe(plan: FfmpegCommandPlan): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.file, plan.args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.on('data', (chunk: Buffer | string) => stdout.push(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer | string) => stderr.push(chunk.toString()));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.join('').slice(0, 4096) || `ffprobe exited with code ${String(code)}.`));
        return;
      }

      try {
        resolve(parseProbeJson(stdout.join('')));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseProbeJson(raw: string): ProbeResult {
  const parsed = JSON.parse(raw) as {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const codecs = parsed.streams?.map((stream) => stream.codec_name).filter(isString);
  const duration = parsed.format?.duration === undefined ? undefined : Number(parsed.format.duration);

  return {
    ...(Number.isFinite(duration) ? { durationSec: duration } : {}),
    ...(typeof video?.width === 'number' ? { width: video.width } : {}),
    ...(typeof video?.height === 'number' ? { height: video.height } : {}),
    ...(typeof parsed.format?.format_name === 'string' ? { formatName: parsed.format.format_name } : {}),
    ...(codecs && codecs.length > 0 ? { codecs } : {}),
  };
}

function isNativeHelperRequest(value: unknown): value is NativeHelperRequest {
  if (!isRecord(value) || !isString(value.type) || !isString(value.requestId)) {
    return false;
  }

  switch (value.type) {
    case 'PING':
      return true;
    case 'PROBE':
      return isRecord(value.payload) && isString(value.payload.inputUrl);
    case 'EXPORT_MEDIA':
      return (
        isRecord(value.payload) &&
        isString(value.payload.jobId) &&
        isString(value.payload.inputUrl) &&
        isString(value.payload.protocol) &&
        isString(value.payload.outputName) &&
        isString(value.payload.outputKind)
      );
    case 'EXTRACT_THUMBNAIL':
      return (
        isRecord(value.payload) &&
        isString(value.payload.candidateId) &&
        isString(value.payload.inputUrl) &&
        isString(value.payload.format)
      );
    case 'EXTRACT_PREVIEW_CLIP':
      return (
        isRecord(value.payload) &&
        isString(value.payload.candidateId) &&
        isString(value.payload.inputUrl) &&
        typeof value.payload.durationSec === 'number' &&
        isString(value.payload.format)
      );
    case 'CANCEL_JOB':
    case 'CLEANUP_JOB':
      return isRecord(value.payload) && isString(value.payload.jobId);
    default:
      return false;
  }
}

function requestIdFrom(value: unknown): string {
  return isRecord(value) && isString(value.requestId) ? value.requestId : 'unknown';
}

function errorResponse(requestId: string, code: string, message: string): NativeHelperResponse {
  return { type: 'ERROR', requestId, payload: { code, message } };
}

function extensionForOutput(payload: FfmpegExportPayload): string {
  switch (payload.outputKind) {
    case 'webm':
      return 'webm';
    case 'audio-only':
      return 'mp3';
    case 'mkv':
      return 'mkv';
    case 'mp4':
      return 'mp4';
    case 'original':
      return extensionFromName(payload.outputName) ?? 'mp4';
    default:
      return 'mp4';
  }
}

function extensionFromName(name: string): string | undefined {
  const extension = name.split('.').pop();
  return extension && extension !== name ? extension : undefined;
}

function mimeForOutput(payload: FfmpegExportPayload): string {
  switch (payload.outputKind) {
    case 'webm':
      return 'video/webm';
    case 'audio-only':
      return 'audio/mpeg';
    case 'mkv':
      return 'video/x-matroska';
    case 'mp4':
    case 'original':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

function mimeForThumbnail(format: string): string {
  switch (format) {
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function mimeForPreview(format: string): string {
  switch (format) {
    case 'webm':
      return 'video/webm';
    case 'mp4':
      return 'video/mp4';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is RequestRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
