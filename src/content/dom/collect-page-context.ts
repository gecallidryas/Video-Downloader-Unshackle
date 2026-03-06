import type { ThumbnailPageContext } from '@/src/core/thumbs/resolve-thumbnail';
import type { PageTitleContext } from '@/src/core/candidates/resolve-display-title';
import { isEmptyLink } from '@/src/core/naming/filename-resolver';

export interface CollectedPageContext
  extends PageTitleContext,
    ThumbnailPageContext {
  pageTitle?: string;
  faviconUrl?: string;
}

export interface CollectPageContextOptions {
  pageUrl?: string;
}

function resolveUrl(value: string | null | undefined, pageUrl: string): string | undefined {
  const raw = value?.trim();

  if (!raw || isEmptyLink(raw)) {
    return undefined;
  }

  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return raw;
  }
}

function metaContent(documentRef: Document, selector: string): string | undefined {
  return (
    documentRef.querySelector<HTMLMetaElement>(selector)?.content.trim() ||
    undefined
  );
}

function linkHref(documentRef: Document, selector: string, pageUrl: string) {
  return resolveUrl(
    documentRef.querySelector<HTMLLinkElement>(selector)?.getAttribute('href'),
    pageUrl,
  );
}

export function collectPageContext(
  documentRef: Document = document,
  options: CollectPageContextOptions = {},
): CollectedPageContext {
  const pageUrl = options.pageUrl ?? documentRef.location?.href ?? '';
  const pageTitle =
    documentRef.title ||
    documentRef.querySelector('title')?.textContent?.trim() ||
    undefined;
  const videoPosterCandidates = Array.from(
    documentRef.querySelectorAll<HTMLVideoElement>('video[poster]'),
  )
    .map((video) => ({
      src: resolveUrl(video.getAttribute('src'), pageUrl) ?? '',
      poster: resolveUrl(video.getAttribute('poster'), pageUrl) ?? '',
    }))
    .filter((candidate) => candidate.poster);

  return {
    pageTitle,
    ogTitle: metaContent(documentRef, 'meta[property="og:title"]'),
    twitterTitle: metaContent(documentRef, 'meta[name="twitter:title"]'),
    ogImageSecure: resolveUrl(
      metaContent(documentRef, 'meta[property="og:image:secure_url"]'),
      pageUrl,
    ),
    ogImage: resolveUrl(
      metaContent(documentRef, 'meta[property="og:image"]'),
      pageUrl,
    ),
    twitterImage: resolveUrl(
      metaContent(documentRef, 'meta[name="twitter:image"]'),
      pageUrl,
    ),
    thumbnailLink: linkHref(documentRef, 'link[rel~="thumbnail"]', pageUrl),
    imageSrc: linkHref(documentRef, 'link[rel~="image_src"]', pageUrl),
    faviconUrl: linkHref(
      documentRef,
      'link[rel~="icon"], link[rel="shortcut icon"]',
      pageUrl,
    ),
    videoPosterCandidates,
  };
}

export function getSelectedLinks(): string[] {
  try {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return [];
    }

    const seen = new Set<string>();
    const links: string[] = [];

    for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const isSelected = Array.from({ length: selection.rangeCount }).some((_, index) => {
        const range = selection.getRangeAt(index);

        try {
          return range.intersectsNode(anchor);
        } catch {
          return selection.containsNode(anchor, true);
        }
      });

      if (!isSelected || isEmptyLink(anchor.getAttribute('href')) || seen.has(anchor.href)) {
        continue;
      }

      seen.add(anchor.href);
      links.push(anchor.href);
    }

    return links;
  } catch {
    return [];
  }
}
