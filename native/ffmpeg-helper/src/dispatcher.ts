import { spawn } from 'node:child_process';
import { open, readFile } from 'node:fs/promises';
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
import {
  buildYtDlpArgs,
  extensionForYtDlpQuality,
  type YtDlpExportPayload,
} from './ytdlp-command.js';
import { runYtDlpJob, type RunYtDlpJobOptions, type YtDlpJobResult } from './ytdlp-runner.js';

// Mirror the PROTOCOLS/OUTPUT_KINDS literal sets from src/native/native-ffmpeg-contract.ts.
// Cannot import across the project boundary (the helper is a standalone Node process),
// so these are maintained in sync manually — they must match the contract's const arrays.
const VALID_PROTOCOLS = new Set(['direct', 'hls', 'dash']);
const VALID_OUTPUT_KINDS = new Set(['original', 'mp4', 'mkv', 'webm', 'audio-only']);
const VALID_YTDLP_QUALITIES = new Set(['best', 'best-mp4', 'worst', 'audio-only']);

const HELPER_VERSION = '0.1.0';

type RequestRecord = Record<string, unknown>;

export type NativeHelperRequest =
  | { type: 'PING'; requestId: string }
  | { type: 'PROBE'; requestId: string; payload: { inputUrl: string } }
  | { type: 'EXPORT_MEDIA'; requestId: string; payload: FfmpegExportPayload }
  | { type: 'EXPORT_YTDLP'; requestId: string; payload: YtDlpExportPayload }
  | { type: 'EXTRACT_THUMBNAIL'; requestId: string; payload: FfmpegThumbnailPayload }
  | { type: 'EXTRACT_PREVIEW_CLIP'; requestId: string; payload: FfmpegPreviewClipPayload }
  | { type: 'READ_ASSET_BYTES'; requestId: string; payload: { outputPath: string; maxBytes: number; offset?: number } }
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
        ytDlpAvailable: boolean;
        platform: string;
        installKind?: 'dev' | 'per-user' | 'system';
      };
    }
  | { type: 'PROBE_RESULT'; requestId: string; payload: ProbeResult }
  | {
      type: 'PROGRESS';
      requestId: string;
      payload: {
        jobId: string;
        progressPct: number;
        phase: 'fetching' | 'exporting' | 'completed';
        timeSec?: number;
      };
    }
  | { type: 'COMPLETED'; requestId: string; payload: ProcessJobResult }
  | { type: 'THUMBNAIL_RESULT'; requestId: string; payload: AssetResultPayload }
  | { type: 'PREVIEW_CLIP_RESULT'; requestId: string; payload: PreviewAssetResultPayload }
  | { type: 'ASSET_BYTES_RESULT'; requestId: string; payload: AssetBytesPayload }
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

type PreviewAssetResultPayload = {
  candidateId: string;
  outputPath: string;
  mimeType: string;
  sizeBytes?: number;
};

type AssetBytesPayload = {
  outputPath: string;
  sizeBytes: number;
  base64: string;
  eof?: boolean;
};

export type RangedReadResult = {
  buffer: Buffer;
  bytesRead: number;
  fileSize: number;
};

export type DispatcherDeps = {
  checkExecutable?: (file: 'ffmpeg' | 'ffprobe' | 'yt-dlp') => Promise<boolean>;
  ensureOutputDirs?: () => Promise<HelperOutputDirs>;
  runProbe?: (plan: FfmpegCommandPlan) => Promise<ProbeResult>;
  runProcessJob?: (options: RunProcessJobOptions) => Promise<ProcessJobResult>;
  runYtDlpJob?: (options: RunYtDlpJobOptions) => Promise<YtDlpJobResult>;
  resolveFfmpegLocation?: () => Promise<string | undefined>;
  readAsset?: (outputPath: string) => Promise<Buffer | Uint8Array>;
  readAssetRange?: (outputPath: string, offset: number, length: number) => Promise<RangedReadResult>;
  registry?: JobRegistry;
};

export type ProgressEmitter = (message: NativeHelperResponse) => void;

export async function dispatchNativeRequest(
  request: unknown,
  deps: DispatcherDeps = {},
  emit?: ProgressEmitter,
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
            ytDlpAvailable: await checkExecutable('yt-dlp', deps),
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
        return dispatchExport(request, deps, emit);

      case 'EXPORT_YTDLP':
        if (!(await checkExecutable('yt-dlp', deps))) {
          return errorResponse(request.requestId, 'YTDLP_NOT_FOUND', 'yt-dlp was not found on PATH.');
        }
        return dispatchYtDlpExport(request, deps, emit);

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

      case 'READ_ASSET_BYTES':
        return dispatchReadAssetBytes(request, deps);

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
  emit?: ProgressEmitter,
): Promise<NativeHelperResponse> {
  const dirs = await ensureDirs(deps);
  const outputPath = helperOwnedPath(dirs, 'outputs', request.payload.outputName, extensionForOutput(request.payload));

  let expectedDurationSec: number | undefined;
  try {
    const probeResult = await (deps.runProbe ?? runProbe)(buildProbeArgs(request.payload.inputUrl));
    expectedDurationSec = probeResult.durationSec;
  } catch {
    // Probe failure is non-fatal — progress will be coarse (0% until completion).
  }

  const result = await (deps.runProcessJob ?? runProcessJob)({
    jobId: request.payload.jobId,
    plan: buildExportArgs(request.payload, outputPath),
    outputPath,
    mimeType: mimeForOutput(request.payload),
    expectedDurationSec,
    registry: deps.registry,
    ...(emit
      ? {
          onProgress: (event) =>
            emit({
              type: 'PROGRESS',
              requestId: request.requestId,
              payload: { ...event.payload },
            }),
        }
      : {}),
  });

  return { type: 'COMPLETED', requestId: request.requestId, payload: result };
}

async function dispatchYtDlpExport(
  request: Extract<NativeHelperRequest, { type: 'EXPORT_YTDLP' }>,
  deps: DispatcherDeps,
  emit?: ProgressEmitter,
): Promise<NativeHelperResponse> {
  const dirs = await ensureDirs(deps);
  const extension = extensionForYtDlpQuality(request.payload.quality);
  const outputPath = helperOwnedPath(dirs, 'outputs', request.payload.outputName, extension);
  const ffmpegLocation = await (deps.resolveFfmpegLocation ?? defaultResolveFfmpegLocation)();
  const plan = buildYtDlpArgs(request.payload, {
    outputPath,
    ...(ffmpegLocation ? { ffmpegLocation } : {}),
  });

  try {
    const result = await (deps.runYtDlpJob ?? runYtDlpJob)({
      jobId: request.payload.jobId,
      plan,
      mimeType: mimeForYtDlp(request.payload),
      registry: deps.registry,
      ...(emit
        ? {
            onProgress: (event) =>
              emit({
                type: 'PROGRESS',
                requestId: request.requestId,
                payload: { ...event.payload },
              }),
          }
        : {}),
    });

    return { type: 'COMPLETED', requestId: request.requestId, payload: result };
  } catch (error) {
    // Map yt-dlp failures to a typed ERROR. Only the error message reaches the
    // payload — captured stderr (which can echo Cookie/Authorization) never does.
    const code = isYtDlpRunnerError(error) ? error.code : 'YTDLP_FAILED';
    const message = error instanceof Error ? error.message : 'yt-dlp export failed.';
    return errorResponse(request.requestId, code, message);
  }
}

function isYtDlpRunnerError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'YtDlpRunnerError' &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

// yt-dlp finds ffmpeg on PATH when --ffmpeg-location is omitted, mirroring the
// PATH-based ffmpeg discovery the ffmpeg export path already relies on. A custom
// bundled location can be injected via deps.resolveFfmpegLocation.
function defaultResolveFfmpegLocation(): Promise<string | undefined> {
  return Promise.resolve(undefined);
}

function mimeForYtDlp(payload: YtDlpExportPayload): string {
  return payload.quality === 'audio-only' ? 'audio/mpeg' : 'video/mp4';
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

  const result = await (deps.runProcessJob ?? runProcessJob)({
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
      sizeBytes: result.sizeBytes,
    },
  };
}

async function dispatchReadAssetBytes(
  request: Extract<NativeHelperRequest, { type: 'READ_ASSET_BYTES' }>,
  deps: DispatcherDeps,
): Promise<NativeHelperResponse> {
  const { outputPath, maxBytes, offset } = request.payload;

  // Ranged read: open ONE file descriptor and read only the requested window to avoid
  // the O(n²) pattern where a 2GB export with 512KB chunks would cause 4096 full-file reads.
  if (offset !== undefined) {
    const { buffer, bytesRead, fileSize } = await (deps.readAssetRange ?? readAssetRange)(
      outputPath,
      offset,
      maxBytes,
    );

    return {
      type: 'ASSET_BYTES_RESULT',
      requestId: request.requestId,
      payload: {
        outputPath,
        sizeBytes: bytesRead,
        base64: buffer.subarray(0, bytesRead).toString('base64'),
        eof: offset + bytesRead >= fileSize,
      },
    };
  }

  const bytes = Buffer.from(await (deps.readAsset ?? readFile)(outputPath));

  if (bytes.byteLength > maxBytes) {
    return errorResponse(
      request.requestId,
      'ASSET_TOO_LARGE',
      `Native asset exceeds the ${String(maxBytes)} byte read cap.`,
    );
  }

  return {
    type: 'ASSET_BYTES_RESULT',
    requestId: request.requestId,
    payload: {
      outputPath,
      sizeBytes: bytes.byteLength,
      base64: bytes.toString('base64'),
    },
  };
}

async function readAssetRange(outputPath: string, offset: number, length: number): Promise<RangedReadResult> {
  const handle = await open(outputPath, 'r');
  try {
    const stat = await handle.stat();
    const fileSize = stat.size;
    const toRead = Math.min(length, Math.max(0, fileSize - offset));
    const buffer = Buffer.allocUnsafe(toRead);
    const { bytesRead } = toRead > 0
      ? await handle.read(buffer, 0, toRead, offset)
      : { bytesRead: 0 };
    return { buffer, bytesRead, fileSize };
  } finally {
    await handle.close();
  }
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

async function checkExecutable(
  file: 'ffmpeg' | 'ffprobe' | 'yt-dlp',
  deps: DispatcherDeps,
): Promise<boolean> {
  return (deps.checkExecutable ?? defaultCheckExecutable)(file);
}

function defaultCheckExecutable(file: 'ffmpeg' | 'ffprobe' | 'yt-dlp'): Promise<boolean> {
  if (file === 'yt-dlp') {
    return new Promise((resolve) => {
      const child = spawn(file, ['--version'], { shell: false, windowsHide: true, stdio: 'ignore' });
      child.once('error', () => resolve(false));
      child.once('close', (code) => resolve(code === 0));
    });
  }

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
        VALID_PROTOCOLS.has(value.payload.protocol) &&
        isString(value.payload.outputName) &&
        isString(value.payload.outputKind) &&
        VALID_OUTPUT_KINDS.has(value.payload.outputKind)
      );
    case 'EXPORT_YTDLP':
      return (
        isRecord(value.payload) &&
        isString(value.payload.jobId) &&
        isHttpUrl(value.payload.inputUrl) &&
        isString(value.payload.outputName) &&
        isString(value.payload.quality) &&
        VALID_YTDLP_QUALITIES.has(value.payload.quality)
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
    case 'READ_ASSET_BYTES':
      return (
        isRecord(value.payload) &&
        isString(value.payload.outputPath) &&
        typeof value.payload.maxBytes === 'number' &&
        value.payload.maxBytes > 0 &&
        (value.payload.offset === undefined ||
          (typeof value.payload.offset === 'number' && value.payload.offset >= 0))
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

function isRecord(value: unknown): value is RequestRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
