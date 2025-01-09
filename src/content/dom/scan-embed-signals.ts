import type { DetectionEvidence } from '@/video_downloader_types_skeleton';

export interface EmbedSignalScanOptions {
  now?: () => number;
  pageUrl?: string;
}

function resolveUrl(value: string | null | undefined, pageUrl: string): string | undefined {
  const raw = value?.trim();

  if (!raw) {
    return undefined;
  }

  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return raw;
  }
}

export function scanEmbedSignals(
  documentRef: Document = document,
  options: EmbedSignalScanOptions = {},
): DetectionEvidence[] {
  const now = options.now ?? (() => Date.now());
  const pageUrl = options.pageUrl ?? documentRef.location?.href ?? '';

  return Array.from(
    documentRef.querySelectorAll<HTMLIFrameElement | HTMLEmbedElement>(
      'iframe[src], embed[src]',
    ),
  )
    .map<DetectionEvidence | undefined>((element) => {
      const url = resolveUrl(element.getAttribute('src'), pageUrl);

      return url
        ? {
            source: 'player-config' as const,
            confidence: 0.3,
            url,
            initiatorUrl: pageUrl,
            elementSelector: element.tagName.toLowerCase(),
            notes: [`embed:${element.tagName.toLowerCase()}`],
            createdAt: now(),
          }
        : undefined;
    })
    .filter((item): item is DetectionEvidence => Boolean(item));
}
