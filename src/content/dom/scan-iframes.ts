import type { DetectionEvidence } from '@/video_downloader_types_skeleton';
import {
  scanMediaElements,
  type DomMediaElementEvidence,
} from './scan-media-elements';

export interface ScanIframesOptions {
  pageUrl?: string;
  maxDepth?: number;
  now?: () => number;
  scanDocument?: (documentRef: Document) => DomMediaElementEvidence[];
  getFrameDocument?: (frame: HTMLIFrameElement) => Document | undefined;
}

export interface ScanIframesResult {
  domEvidence: DomMediaElementEvidence[];
  embedEvidence: DetectionEvidence[];
}

function resolveUrl(value: string | null | undefined, pageUrl: string): string {
  const raw = value?.trim() ?? '';

  if (!raw) {
    return pageUrl;
  }

  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return raw;
  }
}

function defaultGetFrameDocument(
  frame: HTMLIFrameElement,
): Document | undefined {
  return frame.contentDocument ?? undefined;
}

function crossOriginEvidence(
  frame: HTMLIFrameElement,
  pageUrl: string,
  now: () => number,
): DetectionEvidence | undefined {
  const url = resolveUrl(frame.getAttribute('src'), pageUrl);

  if (!url) {
    return undefined;
  }

  return {
    source: 'player-config',
    confidence: 0.35,
    url,
    initiatorUrl: pageUrl,
    elementSelector: 'iframe',
    notes: ['embed:iframe', 'cross-origin:true'],
    createdAt: now(),
  };
}

export function scanIframes(
  root: Document,
  options: ScanIframesOptions = {},
): ScanIframesResult {
  const maxDepth = options.maxDepth ?? 2;
  const pageUrl = options.pageUrl ?? root.location?.href ?? '';
  const now = options.now ?? (() => Date.now());
  const scanDocument =
    options.scanDocument ??
    ((documentRef: Document) => scanMediaElements(documentRef, { pageUrl }));
  const getFrameDocument = options.getFrameDocument ?? defaultGetFrameDocument;
  const domEvidence: DomMediaElementEvidence[] = [];
  const embedEvidence: DetectionEvidence[] = [];

  function visit(documentRef: Document, depth: number): void {
    if (depth > maxDepth) {
      return;
    }

    const childDocuments: Document[] = [];

    for (const frame of Array.from(
      documentRef.querySelectorAll<HTMLIFrameElement>('iframe[src]'),
    )) {
      let frameDocument: Document | undefined;

      try {
        frameDocument = getFrameDocument(frame);
      } catch {
        const evidence = crossOriginEvidence(frame, pageUrl, now);

        if (evidence) {
          embedEvidence.push(evidence);
        }
        continue;
      }

      if (!frameDocument) {
        const evidence = crossOriginEvidence(frame, pageUrl, now);

        if (evidence) {
          embedEvidence.push(evidence);
        }
        continue;
      }

      domEvidence.push(...scanDocument(frameDocument));
      childDocuments.push(frameDocument);
    }

    for (const frameDocument of childDocuments) {
      visit(frameDocument, depth + 1);
    }
  }

  visit(root, 0);

  return { domEvidence, embedEvidence };
}
