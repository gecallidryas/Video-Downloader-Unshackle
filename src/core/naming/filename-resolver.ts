const FORBIDDEN_CHARS = /[\x00-\x1F<>:"/\\|?*]+/g;
const MAX_BASE_LENGTH = 200;

export function parseContentDispositionFilename(
  header: string | undefined,
): string | undefined {
  if (!header) {
    return undefined;
  }

  const extended = /filename\*\s*=\s*([^;]+)/i.exec(header);

  if (extended?.[1]) {
    const decoded = decodeFilenameStar(extended[1].trim());

    if (decoded) {
      return decoded;
    }
  }

  const plain = /filename\s*=\s*("([^"]*)"|([^;]+))/i.exec(header);

  if (plain) {
    const value = (plain[2] ?? plain[3] ?? '').trim();

    return value || undefined;
  }

  return undefined;
}

function decodeFilenameStar(raw: string): string | undefined {
  const match = /^([^']+)'([^']*)'(.+)$/.exec(raw);

  if (!match) {
    return undefined;
  }

  const [, charset, , encoded] = match;

  try {
    if (/utf-?8/i.test(charset)) {
      return decodeURIComponent(encoded);
    }

    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

export function normalizeFilenameUnicode(value: string): string {
  return value.normalize('NFC');
}

export function isEmptyLink(href: string | undefined | null): boolean {
  if (href === undefined || href === null) {
    return true;
  }

  const trimmed = href.trim();

  if (trimmed === '' || trimmed === '#') {
    return true;
  }

  if (/^javascript:\s*(void\s*\([^)]*\)|void\s+0|;?\s*$)/i.test(trimmed)) {
    return true;
  }

  return false;
}

export interface RichFilenameInput {
  author?: string;
  title?: string;
  quality?: string;
  extension: string;
  pageTitle?: string;
  url?: string;
}

function sanitizePart(value: string): string {
  return value.replace(FORBIDDEN_CHARS, '_').trim();
}

function filenameFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    const base = parsed.pathname.split('/').filter(Boolean).pop();

    if (!base) {
      return undefined;
    }

    return base.replace(/\.[a-z0-9]{1,5}$/i, '');
  } catch {
    return undefined;
  }
}

function trimBase(base: string): string {
  if (base.length <= MAX_BASE_LENGTH) {
    return base;
  }

  return base.slice(0, MAX_BASE_LENGTH).trim();
}

export function resolveRichFilename(input: RichFilenameInput): string {
  const parts: string[] = [];

  if (input.author?.trim()) {
    parts.push(sanitizePart(input.author));
  }

  const titleSource =
    input.title?.trim() ||
    input.pageTitle?.trim() ||
    filenameFromUrl(input.url) ||
    'download';

  parts.push(sanitizePart(titleSource));

  if (input.quality?.trim()) {
    parts.push(sanitizePart(input.quality));
  }

  const base = trimBase(parts.filter(Boolean).join(' - '));
  const safe = base || 'download';

  return normalizeFilenameUnicode(`${safe}.${input.extension}`);
}
