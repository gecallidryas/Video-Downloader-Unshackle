import type {
  DetectorPlugin,
  PluginDetectionOutput,
} from '@/src/core/plugins/detector-plugin';
import {
  createMediaEvidence,
  safeParseJson,
  scriptTexts,
  uniqueByUrl,
} from './base-detector';

const pluginId = 'okru';

interface OkruCandidate {
  url: string;
  source: string;
}

function unescapeJson(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function extractFromMetadata(scripts: string[]): OkruCandidate[] {
  const pattern = /"metadata"\s*:\s*"(\{[\s\S]+?\})"/;
  const candidates: OkruCandidate[] = [];

  for (const text of scripts) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;

    const parsed = safeParseJson<{ videos?: Array<{ url?: string }> }>(
      unescapeJson(match[1]),
    );
    if (!parsed?.videos) continue;

    for (const video of parsed.videos) {
      if (typeof video.url === 'string' && video.url) {
        candidates.push({ url: video.url, source: 'okru-metadata' });
      }
    }
  }

  return candidates;
}

function extractFromDataOptions(documentRef: Document): OkruCandidate[] {
  const element = documentRef.querySelector('[data-options]');
  const raw = element?.getAttribute('data-options');
  if (!raw) return [];

  const parsed = safeParseJson<{
    flashvars?: { metadata?: string };
  }>(raw);

  const metadataStr = parsed?.flashvars?.metadata;
  if (!metadataStr) return [];

  const metadata = safeParseJson<{ videos?: Array<{ url?: string }> }>(metadataStr);
  if (!metadata?.videos) return [];

  const candidates: OkruCandidate[] = [];

  for (const video of metadata.videos) {
    if (typeof video.url === 'string' && video.url) {
      candidates.push({ url: video.url, source: 'okru-data-options' });
    }
  }

  return candidates;
}

function extractFromStVideo(scripts: string[]): OkruCandidate[] {
  const pattern = /st\.video\s*=\s*(\{[\s\S]+?\});/;
  const candidates: OkruCandidate[] = [];

  for (const text of scripts) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;

    const parsed = safeParseJson<{ videoSrc?: string }>(match[1]);
    if (typeof parsed?.videoSrc === 'string' && parsed.videoSrc) {
      candidates.push({ url: parsed.videoSrc, source: 'okru-st-video' });
    }
  }

  return candidates;
}

export function createOkruDetector(): DetectorPlugin {
  return {
    id: pluginId,
    name: 'OK.ru',
    domains: ['ok.ru'],
    capabilities: ['player-config'],
    detect: async (context) => {
      if (!context.document) {
        return [];
      }

      const scripts = scriptTexts(context.document);
      const candidates = uniqueByUrl([
        ...extractFromMetadata(scripts),
        ...extractFromDataOptions(context.document),
        ...extractFromStVideo(scripts),
      ]);

      if (candidates.length === 0) {
        return [];
      }

      const title =
        context.pageTitle ?? context.document.title ?? 'OK.ru Video';

      return candidates.map<PluginDetectionOutput>((candidate) => ({
        kind: 'evidence',
        evidence: createMediaEvidence(context, {
          pluginId,
          source: candidate.source,
          url: candidate.url,
          protocol: 'direct',
          title,
          confidence: 0.70,
        }),
      }));
    },
  };
}
