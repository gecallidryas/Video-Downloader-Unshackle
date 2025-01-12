import type {
  DetectorPlugin,
  PluginDetectionOutput,
} from '@/src/core/plugins/detector-plugin';
import {
  createMediaEvidence,
  createPolicyRestriction,
  documentTitle,
  firstMetaContent,
  resolveUrl,
  safeParseJson,
  scriptTexts,
  uniqueByUrl,
} from './base-detector';

const pluginId = 'twitch';

interface TwitchQuality {
  sourceURL?: string;
  quality?: string;
  width?: number;
  height?: number;
}

function findClipQualities(documentRef: Document): TwitchQuality[] {
  for (const text of scriptTexts(documentRef)) {
    const qualityMatch = text.match(/"videoQualities"\s*:\s*(\[[^\]]+\])/);

    if (qualityMatch?.[1]) {
      return safeParseJson<TwitchQuality[]>(qualityMatch[1]) ?? [];
    }

    const clipMatch = text.match(/"clip"\s*:\s*(\{[^}]+\})/);
    const clip = clipMatch?.[1]
      ? safeParseJson<{ videoQualities?: TwitchQuality[] }>(clipMatch[1])
      : undefined;

    if (clip?.videoQualities) {
      return clip.videoQualities;
    }
  }

  return [];
}

function isClipPage(url: URL): boolean {
  return url.hostname === 'clips.twitch.tv' || url.pathname.includes('/clip/');
}

function isVodPage(url: URL): boolean {
  return url.pathname.includes('/videos/');
}

function isLivePage(url: URL): boolean {
  return (
    !isClipPage(url) &&
    !isVodPage(url) &&
    url.pathname.split('/').filter(Boolean).length === 1
  );
}

export function createTwitchDetector(): DetectorPlugin {
  return {
    id: pluginId,
    name: 'Twitch',
    domains: ['twitch.tv', 'clips.twitch.tv', 'm.twitch.tv'],
    capabilities: ['dom-scan', 'player-config', 'policy-warning'],
    detect: async (context) => {
      if (!context.document) {
        return [];
      }

      const title = documentTitle(context, 'Twitch Video');

      if (isLivePage(context.url)) {
        return {
          kind: 'restriction',
          restriction: createPolicyRestriction(context, {
            status: 'unsupported',
            code: 'unsupported-host',
            message: 'Twitch live streams require a dedicated live recording workflow.',
            sourcePluginId: pluginId,
          }),
        };
      }

      const found: Array<{
        url: string;
        source: string;
        quality?: string;
        width?: number;
        height?: number;
      }> = [];

      if (isClipPage(context.url)) {
        for (const quality of findClipQualities(context.document)) {
          const url = resolveUrl(quality.sourceURL, context.url.href);

          if (url) {
            found.push({
              url,
              source: 'twitch-clip',
              quality: quality.quality,
              width: quality.width,
              height: quality.height,
            });
          }
        }

        for (const [selector, source] of [
          ['meta[property="og:video"]', 'twitch-clip-og'],
          ['meta[name="twitter:player:stream"]', 'twitch-clip-twitter'],
        ] as const) {
          const url = resolveUrl(
            firstMetaContent(context.document, [selector]),
            context.url.href,
          );

          if (url) {
            found.push({ url, source });
          }
        }
      }

      for (const video of Array.from(
        context.document.querySelectorAll<HTMLVideoElement>('video'),
      )) {
        const url = resolveUrl(video.getAttribute('src'), context.url.href);

        if (url?.includes('.m3u8')) {
          found.push({
            url,
            source: isVodPage(context.url)
              ? 'twitch-vod-hls'
              : 'twitch-video-element',
          });
        }
      }

      return uniqueByUrl(found).map<PluginDetectionOutput>((item) => ({
        kind: 'evidence',
        evidence: createMediaEvidence(context, {
          pluginId,
          source: item.source,
          url: item.url,
          protocol: item.url.includes('.m3u8') ? 'hls' : 'direct',
          title,
          quality: item.quality,
          width: item.width,
          height: item.height,
          confidence: 0.84,
        }),
      }));
    },
  };
}
