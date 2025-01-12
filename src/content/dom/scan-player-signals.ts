import type { DetectionEvidence } from '@/video_downloader_types_skeleton';
import type { DomMediaElementEvidence } from './scan-media-elements';

export interface PlayerSignalScanOptions {
  now?: () => number;
  documentRef?: Document;
}

export interface PlayerSignalScanResult {
  evidence: DetectionEvidence[];
  domEvidence: DomMediaElementEvidence[];
}

const mediaUrlPattern =
  /https?:\\?\/\\?\/[^\s"'`<>\\]+?\.(?:m3u8|m3u|mpd|mp4|m4v|webm|mov|mp3|m4a|aac|flac|ogg|opus|wav)(?:\?[^\s"'`<>\\]*)?/gi;

function normalizeUrl(value: string): string {
  return value.replaceAll('\\/', '/').replace(/[),.;\]}]+$/, '');
}

function getExtension(value: string): string | undefined {
  try {
    const pathname = new URL(value).pathname;

    return pathname.includes('.') ? pathname.split('.').pop()?.toLowerCase() : undefined;
  } catch {
    const path = value.split(/[?#]/, 1)[0] ?? '';

    return path.includes('.') ? path.split('.').pop()?.toLowerCase() : undefined;
  }
}

function protocolFromUrl(value: string): 'direct' | 'hls' | 'dash' {
  const extension = getExtension(value);

  if (extension === 'm3u8' || extension === 'm3u') {
    return 'hls';
  }

  if (extension === 'mpd') {
    return 'dash';
  }

  return 'direct';
}

function firstMatch(source: string, pattern: RegExp): string | undefined {
  return pattern.exec(source)?.[1]?.trim();
}

function getContext(scriptText: string, index: number, rawUrlLength: number): string {
  return scriptText.slice(
    Math.max(0, index - 350),
    Math.min(scriptText.length, index + rawUrlLength + 350),
  );
}

function getScriptTitle(scriptText: string): string | undefined {
  return firstMatch(scriptText, /\btitle\b\s*[:=]\s*['"`]([^'"`]+)['"`]/i);
}

function getScriptThumbnail(scriptText: string): string | undefined {
  return firstMatch(
    scriptText,
    /\b(?:poster|thumbnail|thumb|image)\b\s*[:=]\s*['"`](https?:\\?\/\\?\/[^'"`]+)['"`]/i,
  )?.replaceAll('\\/', '/');
}

function getResolution(context: string): string | undefined {
  const explicitHeight = firstMatch(context, /\bheight\b\s*[:=]\s*(\d{3,4})\b/i);

  if (explicitHeight) {
    return `${explicitHeight}p`;
  }

  return firstMatch(context, /\b(?:label|quality)\b\s*[:=]\s*['"`](\d{3,4}p)['"`]/i);
}

function getBitrate(context: string): string | undefined {
  return firstMatch(
    context,
    /\b(?:bitrate|bandwidth|averageBandwidth)\b\s*[:=]\s*(\d{4,10})\b/i,
  );
}

function buildPlayerConfigEvidence(input: {
  url: string;
  scriptText: string;
  context: string;
  now: () => number;
}): DetectionEvidence {
  const protocol = protocolFromUrl(input.url);
  const notes = [`protocol:${protocol}`];
  const title = getScriptTitle(input.scriptText);
  const thumbnail = getScriptThumbnail(input.scriptText);
  const resolution = getResolution(input.context);
  const bitrate = getBitrate(input.context);

  if (title) {
    notes.push(`title:${title}`);
  }
  if (thumbnail) {
    notes.push(`thumbnail-url:${thumbnail}`);
  }
  if (resolution) {
    notes.push(`resolution:${resolution}`);
  }
  if (bitrate) {
    notes.push(`bitrate:${bitrate}`);
  }

  return {
    source: 'player-config',
    confidence: 0.65,
    url: input.url,
    notes,
    createdAt: input.now(),
  };
}

function scanScriptText(scriptText: string, now: () => number): DetectionEvidence[] {
  const evidence: DetectionEvidence[] = [];
  const seenUrls = new Set<string>();

  for (const match of scriptText.matchAll(mediaUrlPattern)) {
    const rawUrl = match[0];
    const url = normalizeUrl(rawUrl);

    if (seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    evidence.push(
      buildPlayerConfigEvidence({
        url,
        scriptText,
        context: getContext(scriptText, match.index ?? 0, rawUrl.length),
        now,
      }),
    );
  }

  return evidence;
}

export function scanPlayerSignals(
  domEvidence: DomMediaElementEvidence[] = [],
  options: PlayerSignalScanOptions = {},
): PlayerSignalScanResult {
  const documentRef =
    options.documentRef ?? (typeof document !== 'undefined' ? document : undefined);
  const now = options.now ?? (() => Date.now());
  const evidence = documentRef
    ? Array.from(documentRef.querySelectorAll('script'))
        .flatMap((script) => scanScriptText(script.textContent ?? '', now))
    : [];

  return {
    evidence,
    domEvidence,
  };
}
