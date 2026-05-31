import path from 'node:path';
const OUTPUT_KINDS = new Set(['original', 'mp4', 'mkv', 'webm', 'audio-only']);
const THUMBNAIL_FORMATS = new Set(['jpg', 'png', 'webp']);
const PREVIEW_FORMATS = new Set(['webm', 'mp4', 'gif']);
const SEGMENTED_PROTOCOL_WHITELIST = 'file,http,https,tcp,tls,crypto';
const HELPER_DIR_NAME = 'VideoDownloaderUnshackle';
export function buildProbeArgs(inputUrl) {
    const input = validateInput(inputUrl);
    return {
        file: 'ffprobe',
        args: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input],
    };
}
export function buildExportArgs(payload, outputPath) {
    const input = validateInput(payload.inputUrl);
    const output = validateHelperOwnedOutputPath(outputPath);
    const kind = validateOutputKind(payload.outputKind);
    const args = baseFfmpegArgs();
    addHeaderArgs(args, payload.headers);
    addProtocolArgs(args, payload.protocol);
    args.push('-i', input);
    addTrimArgs(args, payload.trim);
    args.push(...exportCodecArgs(kind), output);
    return { file: 'ffmpeg', args };
}
export function buildThumbnailArgs(payload, outputPath) {
    const input = validateInput(payload.inputUrl);
    const output = validateHelperOwnedOutputPath(outputPath);
    if (!THUMBNAIL_FORMATS.has(payload.format)) {
        throw new Error(`Unsupported thumbnail format: ${String(payload.format)}`);
    }
    const args = baseFfmpegArgs();
    addHeaderArgs(args, payload.headers);
    args.push('-ss', formatSeconds(payload.atSec ?? 0), '-i', input);
    args.push('-frames:v', '1', '-f', 'image2', output);
    return { file: 'ffmpeg', args };
}
export function buildPreviewClipArgs(payload, outputPath) {
    const input = validateInput(payload.inputUrl);
    const output = validateHelperOwnedOutputPath(outputPath);
    if (!PREVIEW_FORMATS.has(payload.format)) {
        throw new Error(`Unsupported preview format: ${String(payload.format)}`);
    }
    if (!Number.isFinite(payload.durationSec) || payload.durationSec <= 0) {
        throw new Error('Preview duration must be positive.');
    }
    const args = baseFfmpegArgs();
    addHeaderArgs(args, payload.headers);
    args.push('-ss', formatSeconds(payload.startSec ?? 0), '-i', input);
    args.push('-t', formatSeconds(payload.durationSec), '-an');
    args.push(...previewCodecArgs(payload.format), output);
    return { file: 'ffmpeg', args };
}
function baseFfmpegArgs() {
    return ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:2'];
}
function addProtocolArgs(args, protocol) {
    if (protocol === 'hls' || protocol === 'dash') {
        args.push('-protocol_whitelist', SEGMENTED_PROTOCOL_WHITELIST);
    }
}
function addHeaderArgs(args, headers) {
    if (!headers) {
        return;
    }
    const serialized = [
        ['referer', 'Referer'],
        ['origin', 'Origin'],
        ['cookie', 'Cookie'],
        ['authorization', 'Authorization'],
    ]
        .map(([key, label]) => {
        const value = headerValue(headers, key)?.trim();
        return value ? `${label}: ${value}` : undefined;
    })
        .filter((line) => Boolean(line))
        .join('\r\n');
    if (serialized) {
        args.push('-headers', `${serialized}\r\n`);
    }
}
function headerValue(headers, key) {
    const match = Object.entries(headers).find(([name]) => name.toLowerCase() === key);
    return match?.[1];
}
function addTrimArgs(args, trim) {
    if (!trim) {
        return;
    }
    if (trim.startSec !== undefined) {
        assertNonNegativeFinite(trim.startSec, 'Trim start');
        args.push('-ss', formatSeconds(trim.startSec));
    }
    if (trim.endSec !== undefined) {
        assertNonNegativeFinite(trim.endSec, 'Trim end');
        if (trim.startSec !== undefined && trim.endSec <= trim.startSec) {
            throw new Error('Trim end must be greater than trim start.');
        }
        args.push('-to', formatSeconds(trim.endSec));
    }
}
function exportCodecArgs(kind) {
    switch (kind) {
        case 'original':
            return ['-c', 'copy'];
        case 'mp4':
            return ['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart'];
        case 'mkv':
            return ['-map', '0', '-c', 'copy'];
        case 'webm':
            return ['-c:v', 'libvpx-vp9', '-c:a', 'libopus'];
        case 'audio-only':
            return ['-vn', '-c:a', 'libmp3lame'];
        default:
            throw new Error(`Unsupported output kind: ${String(kind)}`);
    }
}
function previewCodecArgs(format) {
    switch (format) {
        case 'webm':
            return ['-vf', 'scale=240:-1', '-c:v', 'libvpx-vp9'];
        case 'mp4':
            return ['-vf', 'scale=240:-1', '-c:v', 'libx264', '-movflags', '+faststart'];
        case 'gif':
            return ['-vf', 'fps=10,scale=240:-1:flags=lanczos'];
        default:
            throw new Error(`Unsupported preview format: ${String(format)}`);
    }
}
function validateOutputKind(kind) {
    if (!OUTPUT_KINDS.has(kind)) {
        throw new Error(`Unsupported output kind: ${String(kind)}`);
    }
    return kind;
}
function validateInput(inputUrl) {
    if (typeof inputUrl !== 'string' || inputUrl.trim() !== inputUrl || inputUrl.length === 0) {
        throw new Error('Unsupported input URL.');
    }
    try {
        const parsed = new URL(inputUrl);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return inputUrl;
        }
    }
    catch {
        if (isHelperOwnedLocalPath(inputUrl)) {
            return inputUrl;
        }
    }
    throw new Error(`Unsupported input URL: ${inputUrl}`);
}
function validateHelperOwnedOutputPath(outputPath) {
    if (!isHelperOwnedLocalPath(outputPath)) {
        throw new Error('Output path must be helper-owned.');
    }
    return outputPath;
}
function isHelperOwnedLocalPath(value) {
    if (typeof value !== 'string' || value.includes('\0') || value.trim() !== value) {
        return false;
    }
    const normalized = value.includes('\\') ? path.win32.normalize(value) : path.normalize(value);
    const parts = normalized.split(/[\\/]+/);
    return ((path.isAbsolute(normalized) || path.win32.isAbsolute(normalized)) &&
        parts.includes(HELPER_DIR_NAME));
}
function assertNonNegativeFinite(value, label) {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be a non-negative number.`);
    }
}
function formatSeconds(value) {
    assertNonNegativeFinite(value, 'Seconds');
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}
//# sourceMappingURL=ffmpeg-command.js.map