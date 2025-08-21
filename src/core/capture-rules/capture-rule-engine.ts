import { parseSizePredicate, type SizePredicate } from './size-predicate';

export interface CaptureRuleEngineOptions {
  customExtensions?: string[];
  customContentTypes?: string[];
  blacklist?: string[];
  minSizeBytes?: number;
  sizePredicate?: string;
}

export interface CaptureRuleInput {
  url: string;
  size?: number;
  contentType?: string;
}

export interface CaptureRuleEngine {
  shouldCapture(input: CaptureRuleInput): boolean;
}

const builtInExtensions = new Set([
  'm3u8',
  'm3u',
  'mpd',
  'f4m',
  'mp4',
  'm4v',
  'webm',
  'mkv',
  'mov',
  'ogv',
  'flv',
  'mp3',
  'm4a',
  'aac',
  'flac',
  'ogg',
  'opus',
  'wav',
  'oga',
  'weba',
  'vtt',
  'srt',
  'ttml',
  'dfxp',
]);

const builtInContentTypePrefixes = ['video/', 'audio/'];
const builtInContentTypes = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'application/mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
  'application/dash+xml',
  'video/vnd.mpeg.dash.mpd',
  'application/f4m+xml',
  'application/vnd.ms-sstr+xml',
  'text/vtt',
  'application/x-subrip',
  'application/ttml+xml',
  'application/ttaf+xml',
]);

function normalizeContentType(value: string | undefined): string | undefined {
  return value?.split(';', 1)[0]?.trim().toLowerCase() || undefined;
}

function getExtension(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split('/').pop() ?? '';

    return lastSegment.includes('.') ? lastSegment.split('.').pop()?.toLowerCase() : undefined;
  } catch {
    const pathWithoutQuery = url.split(/[?#]/, 1)[0] ?? '';

    return pathWithoutQuery.includes('.') ? pathWithoutQuery.split('.').pop()?.toLowerCase() : undefined;
  }
}

function validateCustomExtension(extension: string): string {
  const normalized = extension.trim().toLowerCase();

  if (!/^\.[a-z0-9][a-z0-9_-]*$/.test(normalized)) {
    throw new Error(`Invalid extension: ${extension}`);
  }

  return normalized.slice(1);
}

function validateCustomContentType(contentType: string): string {
  const normalized = normalizeContentType(contentType);

  if (!normalized || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(normalized)) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  return normalized;
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.trim();

  if (!normalized) {
    throw new Error(`Invalid blacklist pattern: ${pattern}`);
  }

  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.');

  return new RegExp(`^${escaped}$`, 'i');
}

function validateMinimumSize(value: number | undefined): number {
  const minimum = value ?? 0;

  if (!Number.isInteger(minimum) || minimum < 0) {
    throw new Error(`Invalid minimum size: ${String(value)}`);
  }

  return minimum;
}

function buildSizePredicate(value: string | undefined): SizePredicate | undefined {
  const normalized = value?.trim();

  return normalized ? parseSizePredicate(normalized) : undefined;
}

export function createCaptureRuleEngine(
  options: CaptureRuleEngineOptions,
): CaptureRuleEngine {
  const customExtensions = new Set(
    (options.customExtensions ?? []).map(validateCustomExtension),
  );
  const customContentTypes = new Set(
    (options.customContentTypes ?? []).map(validateCustomContentType),
  );
  const blacklist = (options.blacklist ?? []).map(globToRegExp);
  const minSizeBytes = validateMinimumSize(options.minSizeBytes);
  const sizePredicate = buildSizePredicate(options.sizePredicate);

  function matchesContentType(contentType: string | undefined): boolean {
    const normalized = normalizeContentType(contentType);

    if (!normalized) {
      return false;
    }

    return (
      builtInContentTypes.has(normalized) ||
      builtInContentTypePrefixes.some((prefix) => normalized.startsWith(prefix)) ||
      customContentTypes.has(normalized)
    );
  }

  function matchesExtension(url: string): boolean {
    const extension = getExtension(url);

    return Boolean(
      extension &&
        (builtInExtensions.has(extension) || customExtensions.has(extension)),
    );
  }

  return {
    shouldCapture(input) {
      if (blacklist.some((pattern) => pattern.test(input.url))) {
        return false;
      }

      if (input.size !== undefined) {
        if (input.size < minSizeBytes) {
          return false;
        }

        if (sizePredicate && !sizePredicate(input.size)) {
          return false;
        }
      }

      return matchesExtension(input.url) || matchesContentType(input.contentType);
    },
  };
}
