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

const pluginId = 'vimeo';

interface VimeoProgressiveFile {
  url?: string;
  quality?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  fps?: number;
  mime?: string;
}

interface VimeoConfig {
  player?: {
    config?: VimeoConfig;
  };
  request?: {
    files?: {
      progressive?: VimeoProgressiveFile[];
      hls?: {
        cdns?: Record<string, { url?: string }>;
      };
      dash?: {
        cdns?: Record<string, { url?: string }>;
      };
    };
  };
  video?: {
    title?: string;
  };
}

function firstCdnUrl(
  cdns: Record<string, { url?: string }> | undefined,
): string | undefined {
  return Object.values(cdns ?? {}).find((cdn) => cdn.url)?.url;
}

function parseConfigFromScripts(documentRef: Document): VimeoConfig | undefined {
  for (const text of scriptTexts(documentRef)) {
    const clipMatch = text.match(/window\.vimeo\.clip\s*=\s*(\{[\s\S]*?\})\s*;/);

    if (clipMatch?.[1]) {
      const parsed = safeParseJson<VimeoConfig>(clipMatch[1]);

      if (parsed) {
        return parsed.player?.config ?? parsed;
      }
    }

    const configMatch = text.match(/playerConfig\s*[:=]\s*(\{[\s\S]*?\})\s*;/);

    if (configMatch?.[1]) {
      const parsed = safeParseJson<VimeoConfig>(configMatch[1]);

      if (parsed) {
        return parsed;
      }
    }
  }

  return undefined;
}

export function createVimeoDetector(): DetectorPlugin {
  return {
    id: pluginId,
    name: 'Vimeo',
    domains: ['vimeo.com', 'player.vimeo.com'],
    capabilities: ['player-config', 'policy-warning'],
    detect: async (context) => {
      if (!context.document) {
        return [];
      }

      const config = parseConfigFromScripts(context.document);

      if (!config) {
        return [];
      }

      const title = config.video?.title;
      const files = config.request?.files;
      const found: Array<{
        url: string;
        protocol: 'direct' | 'hls' | 'dash';
        source: string;
        quality?: string;
        width?: number;
        height?: number;
        bitrate?: number;
        mimeType?: string;
      }> = [];

      for (const progressive of files?.progressive ?? []) {
        if (!progressive.url) {
          continue;
        }

        found.push({
          url: progressive.url,
          protocol: 'direct',
          source: 'vimeo-progressive',
          quality: progressive.quality,
          width: progressive.width,
          height: progressive.height,
          bitrate: progressive.bitrate,
          mimeType: progressive.mime,
        });
      }

      const hlsUrl = firstCdnUrl(files?.hls?.cdns);
      if (hlsUrl) {
        found.push({
          url: hlsUrl,
          protocol: 'hls',
          source: 'vimeo-hls',
        });
      }

      const dashUrl = firstCdnUrl(files?.dash?.cdns);
      if (dashUrl) {
        found.push({
          url: dashUrl,
          protocol: 'dash',
          source: 'vimeo-dash',
        });
      }

      return uniqueByUrl(found).map<PluginDetectionOutput>((item) => ({
        kind: 'evidence',
        evidence: createMediaEvidence(context, {
          pluginId,
          source: item.source,
          url: item.url,
          protocol: item.protocol,
          title,
          quality: item.quality,
          width: item.width,
          height: item.height,
          bitrate: item.bitrate,
          mimeType: item.mimeType,
          confidence: 0.9,
        }),
      }));
    },
  };
}
