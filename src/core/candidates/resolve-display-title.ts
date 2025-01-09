export interface PageTitleContext {
  pageTitle?: string;
  ogTitle?: string;
  twitterTitle?: string;
}

export interface ResolveDisplayTitleInput {
  sourceType?: string;
  mediaKind?: string;
  detectedTitle?: string;
  title?: string;
  pageContext?: PageTitleContext;
  tabTitle?: string;
  url?: string;
  uri?: string;
  fallbackIndex?: number;
}

export interface ResolvedDisplayTitle {
  displayTitle: string;
  titleSource: 'detector' | 'page' | 'tab' | 'url' | 'auto';
}

const genericTitles = new Set([
  'detected video',
  'video',
  'unknown video',
  'untitled',
]);

function normalizeText(value: string | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isGenericStreamTitle(title: string): boolean {
  const normalized = normalizeText(title).toLowerCase();

  if (!normalized) {
    return true;
  }

  return /^(dash|hls)(\s+stream)?(\s+\d{2,4}p)?$/.test(normalized);
}

function isMeaningfulTitle(title: string, sourceType: string): boolean {
  const normalized = normalizeText(title);

  if (!normalized || normalized.length < 2) {
    return false;
  }

  if (genericTitles.has(normalized.toLowerCase())) {
    return false;
  }

  return !(
    (sourceType === 'hls' || sourceType === 'dash') &&
    isGenericStreamTitle(normalized)
  );
}

function titleFromUrl(value: string | undefined): string {
  if (!value) {
    return '';
  }

  try {
    const parsed = new URL(value);
    const raw = parsed.pathname.split('/').filter(Boolean).pop() ?? '';

    return decodeURIComponent(raw)
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

function autoTypeLabel(sourceType: string, mediaKind: string): string {
  if (mediaKind === 'gif') {
    return 'GIF';
  }

  if (sourceType === 'hls') {
    return 'HLS Stream';
  }

  if (sourceType === 'dash') {
    return 'DASH Stream';
  }

  return 'Video';
}

export function resolveDisplayTitle(
  input: ResolveDisplayTitleInput,
): ResolvedDisplayTitle {
  const sourceType = normalizeText(input.sourceType).toLowerCase() || 'direct';
  const mediaKind = normalizeText(input.mediaKind).toLowerCase();
  const pageContext = input.pageContext ?? {};
  const candidates: ResolvedDisplayTitle[] = [
    {
      displayTitle: normalizeText(input.detectedTitle ?? input.title),
      titleSource: 'detector',
    },
    { displayTitle: normalizeText(pageContext.ogTitle), titleSource: 'page' },
    {
      displayTitle: normalizeText(pageContext.twitterTitle),
      titleSource: 'page',
    },
    { displayTitle: normalizeText(pageContext.pageTitle), titleSource: 'page' },
    { displayTitle: normalizeText(input.tabTitle), titleSource: 'tab' },
    {
      displayTitle: titleFromUrl(input.uri ?? input.url),
      titleSource: 'url',
    },
  ];

  for (const candidate of candidates) {
    if (isMeaningfulTitle(candidate.displayTitle, sourceType)) {
      return candidate;
    }
  }

  const fallbackIndex = Number.isFinite(input.fallbackIndex)
    ? Math.max(1, Math.trunc(Number(input.fallbackIndex)))
    : 1;

  return {
    displayTitle: `Untitled ${autoTypeLabel(sourceType, mediaKind)} #${fallbackIndex}`,
    titleSource: 'auto',
  };
}
