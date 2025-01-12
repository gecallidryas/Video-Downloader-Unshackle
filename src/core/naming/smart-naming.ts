export interface SmartNamingVideo {
  id?: string;
  title?: string;
  displayName?: string;
  pageTitle?: string;
  pageUrl?: string;
  sourceUrl?: string;
  manifestUrl?: string;
  height?: number;
  quality?: string;
  bitrate?: number;
  outputFormat?: string;
}

export interface SmartNamingOptions {
  template?: string;
  hostRules?: Record<string, string>;
  now?: Date;
  exists?: (filename: string) => boolean;
}

const DEFAULT_TEMPLATE = '{title}_{quality}_{date}_{time}';
const RESERVED_WINDOWS_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function formatTime(date: Date): string {
  return `${pad2(date.getUTCHours())}-${pad2(date.getUTCMinutes())}-${pad2(date.getUTCSeconds())}`;
}

function hostFromUrl(value: string | undefined): string {
  if (!value) {
    return '';
  }

  try {
    const hostname = new URL(value).hostname.toLowerCase();

    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch {
    return '';
  }
}

function domainForVideo(video: SmartNamingVideo): string {
  return hostFromUrl(video.pageUrl) || hostFromUrl(video.sourceUrl) || hostFromUrl(video.manifestUrl);
}

function titleForVideo(video: SmartNamingVideo): string {
  const title = video.title ?? video.displayName ?? video.pageTitle;

  if (title?.trim()) {
    return title.trim();
  }

  const url = video.sourceUrl ?? video.manifestUrl ?? video.pageUrl;

  if (!url) {
    return 'video';
  }

  try {
    const base = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';

    return base.replace(/\.[a-z0-9]{1,5}$/i, '') || 'video';
  } catch {
    return 'video';
  }
}

function qualityForVideo(video: SmartNamingVideo): string {
  if (video.height) {
    return `${video.height}p`;
  }

  if (video.quality?.trim()) {
    return video.quality.trim();
  }

  if (video.bitrate) {
    return `${Math.round(video.bitrate / 1000)}kbps`;
  }

  return 'source';
}

function safeExtension(value: string | undefined): string {
  const ext = String(value ?? 'mp4').trim().toLowerCase();

  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'mp4';
}

function templateForHost(
  host: string,
  fallbackTemplate: string,
  rules: Record<string, string> | undefined,
): string {
  let best: string | undefined;
  let bestLength = 0;

  for (const [rawPattern, template] of Object.entries(rules ?? {})) {
    const pattern = rawPattern.toLowerCase().trim();
    const normalized = pattern.startsWith('*.') ? pattern.slice(2) : pattern;
    const matches = host === normalized || host.endsWith(`.${normalized}`);

    if (matches && normalized.length > bestLength) {
      best = template;
      bestLength = normalized.length;
    }
  }

  return best ?? fallbackTemplate;
}

function sanitizeFilename(value: string, extension: string): string {
  let base = value.replace(/[\x00-\x1F<>:"/\\|?*]+/g, '_');
  base = base.replace(/\s+/g, ' ').trim();
  base = base.replace(/_+/g, '_');
  base = base.replace(/^[._\s]+/, '').replace(/[.\s_-]+$/, '');

  if (!base) {
    base = 'video';
  }

  base = base.replace(/\.[a-z0-9]{1,5}$/i, '');

  if (RESERVED_WINDOWS_NAMES.has(base.toLowerCase())) {
    base = `_${base}`;
  }

  return `${base}.${extension}`;
}

function dedupeFilename(
  filename: string,
  exists: SmartNamingOptions['exists'],
): string {
  if (!exists || !exists(filename)) {
    return filename;
  }

  const match = /^(.*)\.([^.]+)$/.exec(filename);
  const base = match?.[1] ?? filename;
  const ext = match?.[2] ? `.${match[2]}` : '';
  let counter = 1;
  let candidate = `${base}_${counter}${ext}`;

  while (exists(candidate)) {
    counter += 1;
    candidate = `${base}_${counter}${ext}`;
  }

  return candidate;
}

export function generateSmartFilename(
  video: SmartNamingVideo,
  options: SmartNamingOptions = {},
): string {
  const now = options.now ?? new Date();
  const extension = safeExtension(video.outputFormat);
  const host = domainForVideo(video);
  const template = templateForHost(
    host,
    options.template ?? DEFAULT_TEMPLATE,
    options.hostRules,
  );
  const context: Record<string, string> = {
    title: titleForVideo(video),
    quality: qualityForVideo(video),
    date: formatDate(now),
    time: formatTime(now),
    datetime: `${formatDate(now)}_${formatTime(now)}`,
    domain: host,
    ext: extension,
    id: video.id?.slice(0, 8) ?? '',
  };
  const rendered = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, key) =>
    key in context ? context[key] : token,
  );

  return dedupeFilename(sanitizeFilename(rendered, extension), options.exists);
}
