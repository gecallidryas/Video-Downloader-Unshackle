import type {
  DetectorPlugin,
  PluginDetectionOutput,
} from '@/src/core/plugins/detector-plugin';
import {
  createMediaEvidence,
  resolveUrl,
  scriptTexts,
  uniqueByUrl,
} from './base-detector';

const pluginId = 'vk';

interface VkCandidate {
  url: string;
  quality: string;
}

function extractUrlQualities(scripts: string[]): VkCandidate[] {
  const candidates: VkCandidate[] = [];
  const urlPattern = /"url(\d+)"\s*:\s*"([^"]+)"/g;

  for (const text of scripts) {
    let match: RegExpExecArray | null;

    while ((match = urlPattern.exec(text)) !== null) {
      if (match[1] && match[2]) {
        const cleaned = match[2].replace(/\\\//g, '/');
        candidates.push({ url: cleaned, quality: `${match[1]}p` });
      }
    }
  }

  return candidates;
}

export function createVkDetector(): DetectorPlugin {
  return {
    id: pluginId,
    name: 'VK Video',
    domains: ['vk.com', 'vkvideo.ru'],
    capabilities: ['player-config'],
    detect: async (context) => {
      if (!context.document) {
        return [];
      }

      const scripts = scriptTexts(context.document);
      const candidates = uniqueByUrl(extractUrlQualities(scripts));

      if (candidates.length === 0) {
        return [];
      }

      const title =
        context.pageTitle ?? context.document.title ?? 'VK Video';

      return candidates.map<PluginDetectionOutput>((candidate) => ({
        kind: 'evidence',
        evidence: createMediaEvidence(context, {
          pluginId,
          source: 'vk-player-params',
          url: candidate.url,
          protocol: 'direct',
          title,
          quality: candidate.quality,
          confidence: 0.72,
        }),
      }));
    },
  };
}
