import type {
  DetectorPlugin,
  PluginDetectionOutput,
} from '@/src/core/plugins/detector-plugin';
import {
  createMediaEvidence,
  documentTitle,
  resolveUrl,
  scriptTexts,
  uniqueByUrl,
} from './base-detector';

const pluginId = 'canva';

function findHlsManifestUrl(documentRef: Document): string | undefined {
  const pattern = /['"]hlsManifestUrl['"]\s*:\s*['"]([^'"]+)['"]/;
  const preferredScripts = scriptTexts(documentRef, 'script[nonce]');
  const allScripts = scriptTexts(documentRef);

  for (const text of [...preferredScripts, ...allScripts]) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

export function createCanvaDetector(): DetectorPlugin {
  return {
    id: pluginId,
    name: 'Canva',
    domains: ['canva.com'],
    capabilities: ['dom-scan', 'player-config'],
    matches: ({ url }) => /\/.*\/watch/.test(url.pathname),
    detect: async (context) => {
      if (!context.document) {
        return [];
      }

      const title = documentTitle(context, 'Canva Video');
      const found: Array<{
        url: string;
        protocol: 'direct' | 'hls';
        source: string;
        mimeType?: string;
      }> = [];
      const hlsUrl = resolveUrl(
        findHlsManifestUrl(context.document),
        context.url.href,
      );

      if (hlsUrl) {
        found.push({
          url: hlsUrl,
          protocol: 'hls',
          source: 'canva-hls',
        });
      }

      for (const video of Array.from(
        context.document.querySelectorAll<HTMLVideoElement>('video'),
      )) {
        const videoUrl = resolveUrl(video.getAttribute('src'), context.url.href);

        if (videoUrl) {
          found.push({
            url: videoUrl,
            protocol: 'direct',
            source: 'canva-video-element',
          });
        }

        for (const sourceElement of Array.from(
          video.querySelectorAll<HTMLSourceElement>('source'),
        )) {
          const sourceUrl = resolveUrl(
            sourceElement.getAttribute('src'),
            context.url.href,
          );

          if (!sourceUrl) {
            continue;
          }

          found.push({
            url: sourceUrl,
            protocol: sourceElement.type.includes('mpegurl') ? 'hls' : 'direct',
            source: 'canva-source-element',
            mimeType: sourceElement.type || undefined,
          });
        }
      }

      return uniqueByUrl(found).map<PluginDetectionOutput>((item) => ({
        kind: 'evidence',
        evidence: createMediaEvidence(context, {
          pluginId,
          source: item.source,
          url: item.url,
          protocol: item.protocol,
          title,
          mimeType: item.mimeType,
          confidence: item.protocol === 'hls' ? 0.88 : 0.82,
        }),
      }));
    },
  };
}
