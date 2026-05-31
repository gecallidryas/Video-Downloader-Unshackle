import { spawn } from 'node:child_process';
import { open, readFile } from 'node:fs/promises';
import { buildExportArgs, buildPreviewClipArgs, buildProbeArgs, buildThumbnailArgs, } from './ffmpeg-command.js';
import { defaultJobRegistry } from './job-registry.js';
import { ensureHelperOutputDirs, helperOwnedPath } from './output-paths.js';
import { runProcessJob } from './process-runner.js';
import { buildYtDlpArgs, extensionForYtDlpQuality, } from './ytdlp-command.js';
import { runYtDlpJob } from './ytdlp-runner.js';
import { listYtDlpSidecars } from './ytdlp-sidecars.js';
// Mirror the PROTOCOLS/OUTPUT_KINDS literal sets from src/native/native-ffmpeg-contract.ts.
// Cannot import across the project boundary (the helper is a standalone Node process),
// so these are maintained in sync manually — they must match the contract's const arrays.
const VALID_PROTOCOLS = new Set(['direct', 'hls', 'dash']);
const VALID_OUTPUT_KINDS = new Set(['original', 'mp4', 'mkv', 'webm', 'audio-only']);
const VALID_YTDLP_QUALITIES = new Set(['best', 'best-mp4', 'worst', 'audio-only']);
const HELPER_VERSION = '0.1.0';
export async function dispatchNativeRequest(request, deps = {}, emit) {
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
    }
    catch (error) {
        return errorResponse(request.requestId, 'HELPER_ERROR', error instanceof Error ? error.message : 'Unknown native helper error.');
    }
}
function nativeInstallKind() {
    const value = process.env.UNSHACKLE_NATIVE_INSTALL_KIND;
    return value === 'per-user' || value === 'system' || value === 'dev' ? value : 'dev';
}
async function dispatchExport(request, deps, emit) {
    const dirs = await ensureDirs(deps);
    const outputPath = helperOwnedPath(dirs, 'outputs', request.payload.outputName, extensionForOutput(request.payload));
    let expectedDurationSec;
    try {
        const probeResult = await (deps.runProbe ?? runProbe)(buildProbeArgs(request.payload.inputUrl));
        expectedDurationSec = probeResult.durationSec;
    }
    catch {
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
                onProgress: (event) => emit({
                    type: 'PROGRESS',
                    requestId: request.requestId,
                    payload: { ...event.payload },
                }),
            }
            : {}),
    });
    return { type: 'COMPLETED', requestId: request.requestId, payload: result };
}
async function dispatchYtDlpExport(request, deps, emit) {
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
                    onProgress: (event) => emit({
                        type: 'PROGRESS',
                        requestId: request.requestId,
                        payload: { ...event.payload },
                    }),
                }
                : {}),
        });
        const sidecarOutputs = request.payload.writeSubtitles
            ? await (deps.readSidecarOutputs ?? listYtDlpSidecars)(plan.outputPath)
            : [];
        return {
            type: 'COMPLETED',
            requestId: request.requestId,
            payload: {
                ...result,
                ...(sidecarOutputs.length > 0 ? { sidecarOutputs } : {}),
            },
        };
    }
    catch (error) {
        // Map yt-dlp failures to a typed ERROR. Only the error message reaches the
        // payload — captured stderr (which can echo Cookie/Authorization) never does.
        const code = isYtDlpRunnerError(error) ? error.code : 'YTDLP_FAILED';
        const message = error instanceof Error ? error.message : 'yt-dlp export failed.';
        return errorResponse(request.requestId, code, message);
    }
}
function isYtDlpRunnerError(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'YtDlpRunnerError' &&
        typeof error.code === 'string');
}
// yt-dlp finds ffmpeg on PATH when --ffmpeg-location is omitted, mirroring the
// PATH-based ffmpeg discovery the ffmpeg export path already relies on. A custom
// bundled location can be injected via deps.resolveFfmpegLocation.
function defaultResolveFfmpegLocation() {
    return Promise.resolve(undefined);
}
function mimeForYtDlp(payload) {
    return payload.quality === 'audio-only' ? 'audio/mpeg' : 'video/mp4';
}
async function dispatchThumbnail(request, deps) {
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
async function dispatchPreview(request, deps) {
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
async function dispatchReadAssetBytes(request, deps) {
    const { outputPath, maxBytes, offset } = request.payload;
    // Ranged read: open ONE file descriptor and read only the requested window to avoid
    // the O(n²) pattern where a 2GB export with 512KB chunks would cause 4096 full-file reads.
    if (offset !== undefined) {
        const { buffer, bytesRead, fileSize } = await (deps.readAssetRange ?? readAssetRange)(outputPath, offset, maxBytes);
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
        return errorResponse(request.requestId, 'ASSET_TOO_LARGE', `Native asset exceeds the ${String(maxBytes)} byte read cap.`);
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
async function readAssetRange(outputPath, offset, length) {
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
    }
    finally {
        await handle.close();
    }
}
async function buildAssetDataUrl(outputPath, mimeType, deps) {
    const bytes = await (deps.readAsset ?? readFile)(outputPath);
    return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}
async function ensureDirs(deps) {
    return (deps.ensureOutputDirs ?? ensureHelperOutputDirs)();
}
async function checkExecutable(file, deps) {
    return (deps.checkExecutable ?? defaultCheckExecutable)(file);
}
function defaultCheckExecutable(file) {
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
function runProbe(plan) {
    return new Promise((resolve, reject) => {
        const child = spawn(plan.file, plan.args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        const stdout = [];
        const stderr = [];
        child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
        child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
        child.once('error', reject);
        child.once('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr.join('').slice(0, 4096) || `ffprobe exited with code ${String(code)}.`));
                return;
            }
            try {
                resolve(parseProbeJson(stdout.join('')));
            }
            catch (error) {
                reject(error);
            }
        });
    });
}
function parseProbeJson(raw) {
    const parsed = JSON.parse(raw);
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
function isNativeHelperRequest(value) {
    if (!isRecord(value) || !isString(value.type) || !isString(value.requestId)) {
        return false;
    }
    switch (value.type) {
        case 'PING':
            return true;
        case 'PROBE':
            return isRecord(value.payload) && isString(value.payload.inputUrl);
        case 'EXPORT_MEDIA':
            return (isRecord(value.payload) &&
                isString(value.payload.jobId) &&
                isString(value.payload.inputUrl) &&
                isString(value.payload.protocol) &&
                VALID_PROTOCOLS.has(value.payload.protocol) &&
                isString(value.payload.outputName) &&
                isString(value.payload.outputKind) &&
                VALID_OUTPUT_KINDS.has(value.payload.outputKind));
        case 'EXPORT_YTDLP':
            return (isRecord(value.payload) &&
                isString(value.payload.jobId) &&
                isHttpUrl(value.payload.inputUrl) &&
                isString(value.payload.outputName) &&
                isString(value.payload.quality) &&
                VALID_YTDLP_QUALITIES.has(value.payload.quality) &&
                (value.payload.binaryPath === undefined || typeof value.payload.binaryPath === 'string') &&
                (value.payload.extraArgs === undefined || isStringArray(value.payload.extraArgs)));
        case 'EXTRACT_THUMBNAIL':
            return (isRecord(value.payload) &&
                isString(value.payload.candidateId) &&
                isString(value.payload.inputUrl) &&
                isString(value.payload.format));
        case 'EXTRACT_PREVIEW_CLIP':
            return (isRecord(value.payload) &&
                isString(value.payload.candidateId) &&
                isString(value.payload.inputUrl) &&
                typeof value.payload.durationSec === 'number' &&
                isString(value.payload.format));
        case 'READ_ASSET_BYTES':
            return (isRecord(value.payload) &&
                isString(value.payload.outputPath) &&
                typeof value.payload.maxBytes === 'number' &&
                value.payload.maxBytes > 0 &&
                (value.payload.offset === undefined ||
                    (typeof value.payload.offset === 'number' && value.payload.offset >= 0)));
        case 'CANCEL_JOB':
        case 'CLEANUP_JOB':
            return isRecord(value.payload) && isString(value.payload.jobId);
        default:
            return false;
    }
}
function requestIdFrom(value) {
    return isRecord(value) && isString(value.requestId) ? value.requestId : 'unknown';
}
function errorResponse(requestId, code, message) {
    return { type: 'ERROR', requestId, payload: { code, message } };
}
function extensionForOutput(payload) {
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
function extensionFromName(name) {
    const extension = name.split('.').pop();
    return extension && extension !== name ? extension : undefined;
}
function mimeForOutput(payload) {
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
function mimeForThumbnail(format) {
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
function mimeForPreview(format) {
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
function isString(value) {
    return typeof value === 'string' && value.length > 0;
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
function isHttpUrl(value) {
    if (!isString(value) || value.trim() !== value) {
        return false;
    }
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    }
    catch {
        return false;
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=dispatcher.js.map