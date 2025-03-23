import type {
  DetectorPlugin,
  PluginDetectionOutput,
} from '@/src/core/plugins/detector-plugin';
import {
  createMediaEvidence,
  uniqueByUrl,
} from './base-detector';

const pluginId = 'iqiyi';

interface IqiyiCandidate {
  url: string;
}

function collectM3u8Urls(value: unknown, out: Set<string>) {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectM3u8Urls(item, out);
    }
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      if (entry.includes('.m3u8') || key.toLowerCase().includes('m3u8')) {
        out.add(entry);
      }
    } else {
      collectM3u8Urls(entry, out);
    }
  }
}

function extractProgram(globalData: Record<string, unknown> | undefined) {
  const dash = globalData?.__dash ?? globalData?.__dashData;

  if (!dash || typeof dash !== 'object') {
    return undefined;
  }

  const data = (dash as { data?: unknown }).data;
  const program =
    data && typeof data === 'object'
      ? ((data as { program?: unknown; video?: unknown }).program ??
        (data as { video?: unknown }).video ??
        data)
      : dash;

  return program;
}

function extractTitle(program: unknown, fallback: string | undefined): string {
  if (program && typeof program === 'object') {
    const title =
      (program as { name?: string }).name || (program as { title?: string }).title;

    if (title) {
      return title;
    }
  }

  return fallback || 'iQIYI';
}

function extractCandidates(globalData: Record<string, unknown> | undefined): {
  title: string;
  candidates: IqiyiCandidate[];
} {
  const program = extractProgram(globalData);
  const urls = new Set<string>();

  collectM3u8Urls(program, urls);

  return {
    title: extractTitle(program, undefined),
    candidates: Array.from(urls)
      .slice(0, 20)
      .map((url) => ({ url })),
  };
}

export function createIqiyiDetector(): DetectorPlugin {
  return {
    id: pluginId,
    name: 'iQIYI',
    domains: ['iqiyi.com'],
    capabilities: ['player-config'],
    detect: async (context) => {
      const extracted = extractCandidates(context.globalData);
      const title =
        extracted.title === 'iQIYI'
          ? context.pageTitle ?? context.document?.title ?? extracted.title
          : extracted.title;
      const candidates = uniqueByUrl(extracted.candidates);

      if (candidates.length === 0) {
        return [];
      }

      return candidates.map<PluginDetectionOutput>((candidate) => ({
        kind: 'evidence',
        evidence: createMediaEvidence(context, {
          pluginId,
          source: 'iqiyi-config',
          url: candidate.url,
          protocol: 'hls',
          title,
          confidence: 0.68,
        }),
      }));
    },
  };
}
