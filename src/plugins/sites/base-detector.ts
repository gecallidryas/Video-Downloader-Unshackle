import type {
  DetectionEvidence,
  StreamProtocol,
} from '@/video_downloader_types_skeleton';
import type {
  DetectorPluginContext,
  PluginRestriction,
} from '@/src/core/plugins/detector-plugin';

export interface MediaEvidenceInput {
  pluginId: string;
  source: string;
  url: string;
  protocol: StreamProtocol;
  title?: string;
  mimeType?: string;
  quality?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  durationSec?: number;
  confidence?: number;
}

export function scriptTexts(
  documentRef: Document,
  selector = 'script',
): string[] {
  return Array.from(documentRef.querySelectorAll<HTMLScriptElement>(selector))
    .map((script) => script.textContent || '')
    .filter(Boolean);
}

export function safeParseJson<T = unknown>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export function resolveUrl(
  value: string | null | undefined,
  baseUrl: string,
): string | undefined {
  const raw = value?.trim();

  if (!raw) {
    return undefined;
  }

  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return raw;
  }
}

export function metaContent(
  documentRef: Document,
  selector: string,
): string | undefined {
  return (
    documentRef.querySelector<HTMLMetaElement>(selector)?.content.trim() ||
    undefined
  );
}

export function firstMetaContent(
  documentRef: Document,
  selectors: string[],
): string | undefined {
  for (const selector of selectors) {
    const value = metaContent(documentRef, selector);

    if (value) {
      return value;
    }
  }

  return undefined;
}

export function documentTitle(
  context: DetectorPluginContext,
  fallback: string,
): string {
  return (
    firstMetaContent(context.document!, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) ||
    context.pageTitle ||
    context.document?.title ||
    fallback
  );
}

export function uniqueByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.url)) {
      return false;
    }

    seen.add(item.url);
    return true;
  });
}

export function createMediaEvidence(
  context: DetectorPluginContext,
  input: MediaEvidenceInput,
): DetectionEvidence {
  const notes = [
    `plugin:${input.pluginId}`,
    `source:${input.source}`,
    `protocol:${input.protocol}`,
  ];

  if (input.protocol === 'hls' || input.protocol === 'dash') {
    notes.push(`manifest-url:${input.url}`);
  }

  if (input.title) {
    notes.push(`title:${input.title}`);
  }

  if (input.quality) {
    notes.push(`quality:${input.quality}`);
  }

  if (input.height) {
    notes.push(`resolution:${input.height}p`);
  }

  if (input.bitrate) {
    notes.push(`bitrate:${input.bitrate}`);
  }

  if (input.durationSec) {
    notes.push(`duration:${input.durationSec}`);
  }

  if (input.mimeType) {
    notes.push(`mime-type:${input.mimeType}`);
  }

  return {
    source: 'player-config',
    confidence: input.confidence ?? 0.85,
    url: input.url,
    initiatorUrl: context.url.href,
    notes,
    createdAt: context.now(),
  };
}

export function createPolicyRestriction(
  context: DetectorPluginContext,
  restriction: Omit<PluginRestriction, 'sourcePluginId' | 'url' | 'pageTitle'> & {
    sourcePluginId: string;
  },
): PluginRestriction {
  return {
    ...restriction,
    url: context.url.href,
    pageTitle: context.pageTitle ?? context.document?.title,
  };
}
