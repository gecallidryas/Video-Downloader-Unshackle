import type {
  DetectionEvidence,
  StreamProtocol,
} from '@/video_downloader_types_skeleton';
import type {
  DetectorPlugin,
  DetectorPluginContext,
  PluginDetectionOutput,
} from '@/src/core/plugins/detector-plugin';
import type { HostDomainRegistryEntry } from './host-domain-registry';
import {
  unpackDeanEdwardsPacker,
  rot13,
  removeSpecialSequences,
  shiftString,
} from '@/src/lib/deobfuscation';

export interface HostMediaResult {
  url: string;
  source: string;
  protocol?: StreamProtocol;
  title?: string;
  quality?: string;
  confidence?: number;
}

export type HostExtractor = (
  context: DetectorPluginContext,
) => HostMediaResult[] | Promise<HostMediaResult[]>;

function scriptTexts(documentRef: Document): string[] {
  return Array.from(documentRef.querySelectorAll<HTMLScriptElement>('script'))
    .map((script) => script.textContent || '')
    .filter(Boolean);
}

function htmlText(documentRef: Document): string {
  return documentRef.documentElement.innerHTML;
}

function resolveUrl(value: string | null | undefined, baseUrl: string): string | undefined {
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

function metaContent(documentRef: Document, selector: string): string | undefined {
  return (
    documentRef.querySelector<HTMLMetaElement>(selector)?.content.trim() ||
    undefined
  );
}

function inferProtocol(url: string): StreamProtocol {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes('.m3u8')) {
    return 'hls';
  }

  if (lowerUrl.includes('.mpd')) {
    return 'dash';
  }

  return 'direct';
}

function createEvidence(
  context: DetectorPluginContext,
  pluginId: string,
  result: HostMediaResult,
): DetectionEvidence {
  const protocol = result.protocol ?? inferProtocol(result.url);
  const notes = [
    `plugin:${pluginId}`,
    `source:${result.source}`,
    `protocol:${protocol}`,
  ];

  if (protocol === 'hls' || protocol === 'dash') {
    notes.push(`manifest-url:${result.url}`);
  }

  if (result.title) {
    notes.push(`title:${result.title}`);
  }

  if (result.quality) {
    notes.push(`quality:${result.quality}`);
  }

  return {
    source: 'player-config',
    confidence: result.confidence ?? 0.74,
    url: result.url,
    initiatorUrl: context.url.href,
    notes,
    createdAt: context.now(),
  };
}

function uniqueByUrl(items: HostMediaResult[]): HostMediaResult[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.url)) {
      return false;
    }

    seen.add(item.url);
    return true;
  });
}

function firstRegexMatch(
  text: string,
  patterns: RegExp[],
): RegExpMatchArray | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return match;
    }
  }

  return undefined;
}

function parseQuality(value: string | undefined): number {
  const parsed = Number(String(value ?? '').match(/\d+/)?.[0] ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function extractSourcesArray(text: string): Array<Record<string, unknown>> {
  const match = text.match(/"sources"\s*:\s*(\[[\s\S]*?\])/);

  if (!match?.[1]) {
    return [];
  }

  try {
    return JSON.parse(match[1]) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

export function createHostPlugin(
  entry: HostDomainRegistryEntry,
  extract: HostExtractor,
): DetectorPlugin {
  return {
    id: entry.id,
    name: entry.name,
    domains: entry.domains,
    capabilities:
      entry.triage === 'safe-dom'
        ? ['dom-scan', 'player-config']
        : ['player-config'],
    detect: async (context) => {
      if (!context.document) {
        return [];
      }

      return uniqueByUrl(await extract(context)).map<PluginDetectionOutput>((result) => ({
        kind: 'evidence',
        evidence: createEvidence(context, entry.id, result),
      }));
    },
  };
}

export function createPolicyOnlyHostPlugin(
  entry: HostDomainRegistryEntry,
): DetectorPlugin {
  return {
    id: entry.id,
    name: entry.name,
    domains: entry.domains,
    capabilities: ['policy-warning'],
    detect: async (context) => ({
      kind: 'restriction',
      restriction: {
        status: 'unsupported',
        code: 'unsupported-host',
        message: `${entry.name} is registered as a policy-only host; bypass-oriented extraction is not ported.`,
        sourcePluginId: entry.id,
        url: context.url.href,
        pageTitle: context.pageTitle ?? context.document?.title,
        details: { triage: entry.triage },
      },
    }),
  };
}

export function extractNewgrounds(context: DetectorPluginContext): HostMediaResult[] {
  const documentRef = context.document!;
  const candidates: HostMediaResult[] = [];

  for (const text of scriptTexts(documentRef)) {
    const sources = extractSourcesArray(text);
    const best = sources
      .filter((source) => typeof source.src === 'string')
      .sort((a, b) => parseQuality(String(b.res)) - parseQuality(String(a.res)))[0];

    if (typeof best?.src === 'string') {
      const url = resolveUrl(best.src, context.url.href);

      if (url) {
        candidates.push({
          url,
          source: 'newgrounds-sources',
          protocol: 'direct',
          quality: typeof best.res === 'string' ? best.res : undefined,
          confidence: 0.82,
        });
      }
    }
  }

  const fallbackMatch = htmlText(documentRef).match(
    /<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i,
  );
  const fallbackUrl = resolveUrl(fallbackMatch?.[1], context.url.href);

  if (fallbackUrl) {
    candidates.push({
      url: fallbackUrl,
      source: 'newgrounds-source-element',
      protocol: 'direct',
    });
  }

  return candidates;
}

export function extractSendvid(context: DetectorPluginContext): HostMediaResult[] {
  const documentRef = context.document!;
  const videoSource = documentRef.querySelector<HTMLSourceElement>('video source');
  const videoUrl = resolveUrl(videoSource?.getAttribute('src'), context.url.href);

  if (videoUrl) {
    return [
      {
        url: videoUrl,
        source: 'sendvid-video-source',
        protocol: 'direct',
      },
    ];
  }

  const ogVideo =
    resolveUrl(metaContent(documentRef, 'meta[property="og:video"]'), context.url.href) ??
    resolveUrl(metaContent(documentRef, 'meta[name="og:video"]'), context.url.href);

  return ogVideo
    ? [
        {
          url: ogVideo,
          source: 'sendvid-og-video',
          protocol: 'direct',
        },
      ]
    : [];
}

export function extractVidoza(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const match = firstRegexMatch(text, [
    /sourcesCode\s*:\s*\[\s*\{\s*src\s*:\s*["']([^"']+)["']/,
    /source\s+src=["']([^"']+\.mp4[^"']*)["']/,
  ]);
  const url = resolveUrl(match?.[1], context.url.href);

  return url ? [{ url, source: 'vidoza-sources-code', protocol: 'direct' }] : [];
}

export function extractYourUpload(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const match = firstRegexMatch(text, [
    /file\s*:\s*['"]([^'"]+\.mp4[^'"]*)['"]/,
    /src\s*:\s*['"]([^'"]+\.mp4[^'"]*)['"]/,
    /source\s+src=['"]([^'"]+\.mp4[^'"]*)['"]/,
  ]);
  const url = resolveUrl(match?.[1], context.url.href);

  return url ? [{ url, source: 'yourupload-config', protocol: 'direct' }] : [];
}

export function extractVidmoly(context: DetectorPluginContext): HostMediaResult[] {
  const match = htmlText(context.document!).match(
    /sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/,
  );
  const url = resolveUrl(match?.[1], context.url.href);

  return url ? [{ url, source: 'vidmoly-sources', protocol: inferProtocol(url) }] : [];
}

export function extractStreamtape(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const match = text.match(
    /id=["']robotlink["'][\s\S]*?innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*\(['"]([^'"]+)['"]\)/,
  );

  if (match?.[1] && match[2]) {
    const combined = `${match[1]}${match[2]}&stream=1`;
    const url = resolveUrl(
      combined.startsWith('//') ? `https:${combined}` : combined,
      context.url.href,
    );

    return url
      ? [
          {
            url,
            source: 'streamtape-robotlink',
            protocol: 'direct',
          },
        ]
      : [];
  }

  const altMatch = text.match(
    /document\.getElementById\('robotlink'\)\.innerHTML\s*=\s*['"]\/\/([^'"]+)/,
  );
  const altUrl = resolveUrl(altMatch?.[1] ? `https://${altMatch[1]}` : undefined, context.url.href);

  return altUrl ? [{ url: altUrl, source: 'streamtape-robotlink', protocol: 'direct' }] : [];
}

export function extractFilePatternHost(
  source: string,
  protocol?: StreamProtocol,
): HostExtractor {
  return (context) => {
    const text = htmlText(context.document!);
    const match = firstRegexMatch(text, [
      /sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/,
      /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/,
      /sources\s*:\s*\[["']([^"']+)["']\]/,
      /src\s*:\s*["']([^"']+\.mp4[^"']*)["']/,
    ]);
    const url = resolveUrl(match?.[1], context.url.href);

    return url ? [{ url, source, protocol: protocol ?? inferProtocol(url) }] : [];
  };
}

export function extractUserload(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const match = text.match(/var\s+videolink\s*=\s*["']([^"']+)["']/);
  const url = resolveUrl(match?.[1], context.url.href);

  return url ? [{ url, source: 'userload-videolink', protocol: 'direct' }] : [];
}

export function extractVidlox(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const match = text.match(/sources\s*:\s*\["([^"]+)"\]/);
  const url = resolveUrl(match?.[1], context.url.href);

  return url ? [{ url, source: 'vidlox-sources', protocol: 'direct' }] : [];
}

// --- Packer-based extractors ---

function extractPackedScript(text: string): string | undefined {
  return text.match(/eval\(function\(p,a,c,k,e,(?:d|r)\)[\s\S]*?(?=<\/script>)/)?.[0];
}

export function extractFilemoon(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const packed = extractPackedScript(text);
  if (!packed) return [];
  const unpacked = unpackDeanEdwardsPacker(packed);
  const match = unpacked.match(/file\s*:\s*["']([^"']+)["']/);
  const url = resolveUrl(match?.[1], context.url.href);
  return url ? [{ url, source: 'filemoon-unpacked', protocol: 'hls' }] : [];
}

export function extractMp4upload(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const packed = extractPackedScript(text);
  if (!packed) return [];
  const unpacked = unpackDeanEdwardsPacker(packed);
  const match = unpacked.match(/player\.src\(["']([^"']+)["']\)/);
  const url = resolveUrl(match?.[1], context.url.href);
  return url ? [{ url, source: 'mp4upload-unpacked', protocol: 'direct' }] : [];
}

export function extractMixdrop(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const packed = extractPackedScript(text);
  if (!packed) return [];
  const unpacked = unpackDeanEdwardsPacker(packed);
  const match = unpacked.match(/wurl\s*=\s*["']([^"']+)["']/);
  if (!match?.[1]) return [];
  let url = match[1];
  if (url.startsWith('//')) url = `https:${url}`;
  return [{ url, source: 'mixdrop-unpacked', protocol: 'direct' }];
}

export function extractUpstream(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const packed = extractPackedScript(text);
  if (!packed) return [];
  const unpacked = unpackDeanEdwardsPacker(packed);
  const match = unpacked.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
  const url = resolveUrl(match?.[1], context.url.href);
  return url ? [{ url, source: 'upstream-unpacked', protocol: 'hls' }] : [];
}

export function extractKwik(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const packed = extractPackedScript(text);
  if (!packed) return [];
  const unpacked = unpackDeanEdwardsPacker(packed);
  const match = unpacked.match(/source\s*=\s*["']([^"']+)["']/);
  const url = resolveUrl(match?.[1], context.url.href);
  return url ? [{ url, source: 'kwik-unpacked', protocol: 'direct' }] : [];
}

export function extractSupervideo(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const packed = extractPackedScript(text);
  if (!packed) return [];
  const unpacked = unpackDeanEdwardsPacker(packed);
  const match = unpacked.match(/file\s*:\s*["']([^"']+)["']/);
  const url = resolveUrl(match?.[1], context.url.href);
  return url ? [{ url, source: 'supervideo-unpacked', protocol: 'hls' }] : [];
}

export function extractDropload(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const packed = extractPackedScript(text);
  if (!packed) return [];
  const unpacked = unpackDeanEdwardsPacker(packed);
  const match = unpacked.match(/file\s*:\s*["']([^"']+)["']/);
  const url = resolveUrl(match?.[1], context.url.href);
  return url ? [{ url, source: 'dropload-unpacked', protocol: 'hls' }] : [];
}

export function extractLuluvdo(context: DetectorPluginContext): HostMediaResult[] {
  const text = htmlText(context.document!);
  const packed = extractPackedScript(text);
  if (!packed) return [];
  const unpacked = unpackDeanEdwardsPacker(packed);
  const match = unpacked.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
  const url = resolveUrl(match?.[1], context.url.href);
  return url ? [{ url, source: 'luluvdo-unpacked', protocol: 'hls' }] : [];
}

// --- VOE deobfuscation extractor ---

export function extractVoe(context: DetectorPluginContext): HostMediaResult[] {
  const html = htmlText(context.document!);
  // Bail on redirect pages
  if (/window\.location\.href\s*=\s*['"]/.test(html)) return [];
  const jsonMatch = html.match(/<script[^>]+type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!jsonMatch?.[1]) return [];
  let json: string[];
  try {
    json = JSON.parse(jsonMatch[1]) as string[];
  } catch {
    return [];
  }
  if (!Array.isArray(json) || !json[0]) return [];
  try {
    let deobf = json[0];
    deobf = rot13(deobf);
    deobf = removeSpecialSequences(deobf);
    deobf = atob(deobf);
    deobf = shiftString(deobf);
    deobf = deobf.split('').reverse().join('');
    deobf = atob(deobf);
    const payload = JSON.parse(deobf) as { source?: string };
    const url = payload['source'];
    if (!url) return [];
    return [{ url, source: 'voe-deobfuscated', protocol: 'hls' }];
  } catch {
    return [];
  }
}

// --- Doodstream pass_md5 extractor (async) ---

export function extractDoodstream(context: DetectorPluginContext): Promise<HostMediaResult[]> {
  const html = htmlText(context.document!);
  const REGEX = /(\/pass_md5\/[^']+)'.+?((?:\?|&)token=[^&]+&expiry=\d*)/s;
  const match = html.match(REGEX);
  if (!match?.[1] || !match?.[2]) return Promise.resolve([]);
  const passPath = match[1];
  const token = match[2];
  const host = context.url.hostname;
  const fullPassUrl = `https://${host}${passPath}`;
  const videoId = context.url.pathname.split('/').pop() ?? '';
  const referer = `https://${host}/e/${videoId}`;
  return fetch(fullPassUrl, {
    headers: { Range: 'bytes=0-', Referer: referer },
  })
    .then((res) => res.text())
    .then((part) => {
      const url = `${part}1234567890${token}${Date.now()}`;
      return [{ url, source: 'doodstream-pass-token', protocol: 'direct' as const }];
    })
    .catch(() => []);
}
