import path from 'node:path';
// Machine-parseable marker the runner greps for in yt-dlp's --progress-template
// output. Emits raw byte counts so the runner computes a percentage without
// parsing yt-dlp's human-formatted "_percent_str" (which embeds ANSI/whitespace).
export const YTDLP_PROGRESS_PREFIX = '[unshackle-progress]';
const QUALITIES = new Set(['best', 'best-mp4', 'worst', 'audio-only']);
const HELPER_DIR_NAME = 'VideoDownloaderUnshackle';
// Flags rejected from user-supplied extra args. These would either break the
// helper-owned-output invariant (output redirection) or allow arbitrary command
// execution / loading attacker-controlled config, so they are stripped at the
// trust boundary regardless of what the extension sends.
const DENIED_EXTRA_FLAGS = new Set([
    '-o',
    '--output',
    '-p',
    '--paths',
    '--exec',
    '--exec-before-download',
    '--config-location',
    '--config',
    '--batch-file',
    '-a',
    '--load-info-json',
    '--load-info',
    '--ffmpeg-location',
    '--external-downloader',
    '--downloader',
    '--postprocessor-args',
    '--ppa',
]);
export function extensionForYtDlpQuality(quality) {
    return quality === 'audio-only' ? 'mp3' : 'mp4';
}
export function buildYtDlpArgs(payload, options) {
    const input = validateHttpUrl(payload.inputUrl);
    const output = validateHelperOwnedOutputPath(options.outputPath);
    const quality = validateQuality(payload.quality);
    const args = [
        '--newline',
        '--no-playlist',
        '--no-warnings',
        '--no-part',
        '--progress',
        '--progress-template',
        `download:${YTDLP_PROGRESS_PREFIX} %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s`,
    ];
    addFormatArgs(args, quality);
    addSubtitleArgs(args, payload.subtitleLanguages, payload.embedSubtitles, payload.writeSubtitles);
    addTrimArgs(args, payload.trim);
    addHeaderArgs(args, payload.headers);
    if (options.ffmpegLocation) {
        args.push('--ffmpeg-location', options.ffmpegLocation);
    }
    // Extra args are appended before our `-o`/`--`, so even a sanitizer miss cannot
    // displace the helper-owned output (last `-o` wins) or be parsed as the URL.
    args.push(...sanitizeExtraArgs(payload.extraArgs));
    args.push('-o', output);
    // `--` stops option parsing so a URL beginning with `-` cannot be read as a flag.
    args.push('--', input);
    return { file: resolveBinary(payload.binaryPath), args, outputPath: output };
}
function resolveBinary(binaryPath) {
    if (binaryPath === undefined) {
        return 'yt-dlp';
    }
    const trimmed = binaryPath.trim();
    if (trimmed.length === 0) {
        return 'yt-dlp';
    }
    if (trimmed !== binaryPath || /[\r\n\0]/.test(trimmed)) {
        throw new Error('Invalid yt-dlp binary path.');
    }
    return trimmed;
}
function sanitizeExtraArgs(extraArgs) {
    if (!extraArgs || extraArgs.length === 0) {
        return [];
    }
    const cleaned = [];
    for (let i = 0; i < extraArgs.length; i += 1) {
        const arg = extraArgs[i];
        if (typeof arg !== 'string' || arg.length === 0 || /[\r\n\0]/.test(arg)) {
            continue;
        }
        // Match both `--flag` and `--flag=value` forms against the denylist.
        const hasInlineValue = arg.startsWith('-') && arg.includes('=');
        const flagName = arg.startsWith('-') ? arg.split('=', 1)[0].toLowerCase() : '';
        if (flagName.length > 0 && DENIED_EXTRA_FLAGS.has(flagName)) {
            // Every denied flag takes a value. In separate-token form (`--exec X`),
            // also drop the following token so its value can't leak through as a bare
            // positional (which yt-dlp would treat as an extra input). The `--flag=value`
            // form carries its value inline, so only the single token is dropped.
            if (!hasInlineValue) {
                i += 1;
            }
            continue;
        }
        cleaned.push(arg);
    }
    return cleaned;
}
function addFormatArgs(args, quality) {
    switch (quality) {
        case 'best':
            args.push('-f', 'bv*+ba/b', '--merge-output-format', 'mp4');
            return;
        case 'best-mp4':
            args.push('-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4');
            return;
        case 'worst':
            args.push('-f', 'wv*+wa/w', '--merge-output-format', 'mp4');
            return;
        case 'audio-only':
            args.push('-x', '--audio-format', 'mp3');
            return;
        default:
            throw new Error(`Unsupported yt-dlp quality: ${String(quality)}`);
    }
}
function addSubtitleArgs(args, languages, embed, write) {
    if (!languages || languages.length === 0) {
        return;
    }
    const cleaned = languages
        .map((lang) => lang.trim())
        .filter((lang) => /^[a-zA-Z0-9_.*-]+$/.test(lang));
    if (cleaned.length === 0) {
        return;
    }
    args.push('--sub-langs', cleaned.join(','));
    if (write) {
        args.push('--write-subs');
    }
    if (embed) {
        args.push('--embed-subs');
    }
    // Default to sidecar files when neither flag is set so requested subs are
    // never silently dropped.
    if (!write && !embed) {
        args.push('--write-subs');
    }
}
function addTrimArgs(args, trim) {
    if (!trim || (trim.startSec === undefined && trim.endSec === undefined)) {
        return;
    }
    if (trim.startSec !== undefined) {
        assertNonNegativeFinite(trim.startSec, 'Trim start');
    }
    if (trim.endSec !== undefined) {
        assertNonNegativeFinite(trim.endSec, 'Trim end');
    }
    if (trim.startSec !== undefined && trim.endSec !== undefined && trim.endSec <= trim.startSec) {
        throw new Error('Trim end must be greater than trim start.');
    }
    const start = trim.startSec === undefined ? '0' : formatSeconds(trim.startSec);
    const end = trim.endSec === undefined ? 'inf' : formatSeconds(trim.endSec);
    args.push('--download-sections', `*${start}-${end}`);
    args.push('--force-keyframes-at-cuts');
}
function addHeaderArgs(args, headers) {
    if (!headers) {
        return;
    }
    for (const [name, value] of Object.entries(headers)) {
        const trimmedName = name.trim();
        const trimmedValue = value.trim();
        // Reject header names/values with CR/LF to prevent argument/header splitting.
        if (trimmedName.length === 0 ||
            trimmedValue.length === 0 ||
            !/^[A-Za-z0-9-]+$/.test(trimmedName) ||
            /[\r\n]/.test(trimmedValue)) {
            continue;
        }
        args.push('--add-header', `${trimmedName}:${trimmedValue}`);
    }
}
function validateQuality(quality) {
    if (!QUALITIES.has(quality)) {
        throw new Error(`Unsupported yt-dlp quality: ${String(quality)}`);
    }
    return quality;
}
function validateHttpUrl(inputUrl) {
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
        throw new Error(`Unsupported input URL: ${inputUrl}`);
    }
    throw new Error(`Unsupported input URL: ${inputUrl}`);
}
function validateHelperOwnedOutputPath(outputPath) {
    if (typeof outputPath !== 'string' || outputPath.includes('\0') || outputPath.trim() !== outputPath) {
        throw new Error('Output path must be helper-owned.');
    }
    const normalized = outputPath.includes('\\')
        ? path.win32.normalize(outputPath)
        : path.normalize(outputPath);
    const parts = normalized.split(/[\\/]+/);
    const isAbsolute = path.isAbsolute(normalized) || path.win32.isAbsolute(normalized);
    if (!isAbsolute || !parts.includes(HELPER_DIR_NAME)) {
        throw new Error('Output path must be helper-owned.');
    }
    return outputPath;
}
function assertNonNegativeFinite(value, label) {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be a non-negative number.`);
    }
}
function formatSeconds(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}
//# sourceMappingURL=ytdlp-command.js.map