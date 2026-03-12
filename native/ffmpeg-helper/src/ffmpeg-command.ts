import path from 'node:path';

export type FfmpegCommandPlan = {
  file: 'ffmpeg' | 'ffprobe';
  args: string[];
};

export type FfmpegProtocol = 'direct' | 'hls' | 'dash';
export type FfmpegOutputKind = 'original' | 'mp4' | 'mkv' | 'webm' | 'audio-only';
export type FfmpegThumbnailFormat = 'jpg' | 'png' | 'webp';
export type FfmpegPreviewFormat = 'webm' | 'mp4' | 'gif';

export type FfmpegTrim = {
  startSec?: number;
  endSec?: number;
};

export type FfmpegExportPayload = {
  jobId: string;
  inputUrl: string;
  protocol: FfmpegProtocol;
  outputName: string;
  outputKind: FfmpegOutputKind;
  outputPath?: string;
  trim?: FfmpegTrim;
  headers?: Record<string, string>;
};

export type FfmpegThumbnailPayload = {
  candidateId: string;
  inputUrl: string;
  atSec?: number;
  format: FfmpegThumbnailFormat;
  headers?: Record<string, string>;
};

export type FfmpegPreviewClipPayload = {
  candidateId: string;
  inputUrl: string;
  startSec?: number;
  durationSec: number;
  format: FfmpegPreviewFormat;
  headers?: Record<string, string>;
};

const OUTPUT_KINDS = new Set<FfmpegOutputKind>(['original', 'mp4', 'mkv', 'webm', 'audio-only']);
const THUMBNAIL_FORMATS = new Set<FfmpegThumbnailFormat>(['jpg', 'png', 'webp']);
const PREVIEW_FORMATS = new Set<FfmpegPreviewFormat>(['webm', 'mp4', 'gif']);
const SEGMENTED_PROTOCOL_WHITELIST = 'file,http,https,tcp,tls,crypto';
const HELPER_DIR_NAME = 'VideoDownloaderUnshackle';

export function buildProbeArgs(inputUrl: string): FfmpegCommandPlan {
  const input = validateInput(inputUrl);

  return {
    file: 'ffprobe',
    args: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input],
  };
}

export function buildExportArgs(payload: FfmpegExportPayload, outputPath: string): FfmpegCommandPlan {
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

export function buildThumbnailArgs(payload: FfmpegThumbnailPayload, outputPath: string): FfmpegCommandPlan {
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

export function buildPreviewClipArgs(payload: FfmpegPreviewClipPayload, outputPath: string): FfmpegCommandPlan {
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

function baseFfmpegArgs(): string[] {
  return ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:2'];
}

function addProtocolArgs(args: string[], protocol: FfmpegProtocol): void {
  if (protocol === 'hls' || protocol === 'dash') {
    args.push('-protocol_whitelist', SEGMENTED_PROTOCOL_WHITELIST);
  }
}

function addHeaderArgs(args: string[], headers: Record<string, string> | undefined): void {
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
    .filter((line): line is string => Boolean(line))
    .join('\r\n');

  if (serialized) {
    args.push('-headers', `${serialized}\r\n`);
  }
}

function headerValue(headers: Record<string, string>, key: string): string | undefined {
  const match = Object.entries(headers).find(([name]) => name.toLowerCase() === key);
  return match?.[1];
}

function addTrimArgs(args: string[], trim: FfmpegTrim | undefined): void {
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

function exportCodecArgs(kind: FfmpegOutputKind): string[] {
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

function previewCodecArgs(format: FfmpegPreviewFormat): string[] {
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

function validateOutputKind(kind: FfmpegOutputKind): FfmpegOutputKind {
  if (!OUTPUT_KINDS.has(kind)) {
    throw new Error(`Unsupported output kind: ${String(kind)}`);
  }

  return kind;
}

function validateInput(inputUrl: string): string {
  if (typeof inputUrl !== 'string' || inputUrl.trim() !== inputUrl || inputUrl.length === 0) {
    throw new Error('Unsupported input URL.');
  }

  try {
    const parsed = new URL(inputUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return inputUrl;
    }
  } catch {
    if (isHelperOwnedLocalPath(inputUrl)) {
      return inputUrl;
    }
  }

  throw new Error(`Unsupported input URL: ${inputUrl}`);
}

function validateHelperOwnedOutputPath(outputPath: string): string {
  if (!isHelperOwnedLocalPath(outputPath)) {
    throw new Error('Output path must be helper-owned.');
  }

  return outputPath;
}

function isHelperOwnedLocalPath(value: string): boolean {
  if (typeof value !== 'string' || value.includes('\0') || value.trim() !== value) {
    return false;
  }

  const normalized = value.includes('\\') ? path.win32.normalize(value) : path.normalize(value);
  const parts = normalized.split(/[\\/]+/);

  return (
    (path.isAbsolute(normalized) || path.win32.isAbsolute(normalized)) &&
    parts.includes(HELPER_DIR_NAME)
  );
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
}

function formatSeconds(value: number): string {
  assertNonNegativeFinite(value, 'Seconds');
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}
