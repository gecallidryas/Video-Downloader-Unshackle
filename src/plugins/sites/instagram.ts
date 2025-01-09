import type {
  DetectorPlugin,
  PluginDetectionOutput,
} from '@/src/core/plugins/detector-plugin';
import {
  createMediaEvidence,
  createPolicyRestriction,
  resolveUrl,
  safeParseJson,
  scriptTexts,
  uniqueByUrl,
} from './base-detector';

const pluginId = 'instagram';

interface InstagramMedia {
  is_video?: boolean;
  video_url?: string;
  dimensions?: {
    width?: number;
    height?: number;
  };
  edge_media_to_caption?: {
    edges?: Array<{ node?: { text?: string } }>;
  };
  edge_sidecar_to_children?: {
    edges?: Array<{ node?: InstagramMedia }>;
  };
}

interface InstagramAdditionalData {
  directUrl?: string;
  graphql?: {
    shortcode_media?: InstagramMedia;
  };
  shortcode_media?: InstagramMedia;
}

interface InstagramFoundMedia {
  url: string;
  source: string;
  title?: string;
  width?: number;
  height?: number;
}

function decodeInstagramUrl(value: string): string {
  return value.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
}

function extractBalancedObject(text: string, startIndex: number): string | undefined {
  let depth = 0;
  let inString: string | undefined;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === inString) {
        inString = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return undefined;
}

function findAdditionalData(documentRef: Document): InstagramAdditionalData[] {
  const results: InstagramAdditionalData[] = [];

  for (const text of scriptTexts(documentRef)) {
    const directMatches = text.matchAll(/"video_url"\s*:\s*"([^"]+)"/g);

    for (const match of directMatches) {
      if (match[1]) {
        results.push({ directUrl: decodeInstagramUrl(match[1]) });
      }
    }

    let searchIndex = 0;
    const marker = 'window.__additionalDataLoaded';

    while (searchIndex < text.length) {
      const markerIndex = text.indexOf(marker, searchIndex);

      if (markerIndex === -1) {
        break;
      }

      const objectStart = text.indexOf('{', markerIndex);
      const objectText =
        objectStart === -1 ? undefined : extractBalancedObject(text, objectStart);
      const parsed = objectText
        ? safeParseJson<InstagramAdditionalData>(objectText)
        : undefined;

      if (parsed) {
        results.push(parsed);
      }

      searchIndex = markerIndex + marker.length;
    }
  }

  return results;
}

function mediaTitle(media: InstagramMedia): string | undefined {
  return media.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 50);
}

function appendFromMedia(
  media: InstagramMedia | undefined,
  found: InstagramFoundMedia[],
  source: string,
) {
  if (!media) {
    return;
  }

  if (media.is_video && media.video_url) {
    found.push({
      url: decodeInstagramUrl(media.video_url),
      source,
      title: mediaTitle(media),
      width: media.dimensions?.width,
      height: media.dimensions?.height,
    });
  }

  for (const edge of media.edge_sidecar_to_children?.edges ?? []) {
    appendFromMedia(edge.node, found, 'instagram-carousel');
  }
}

function findMedia(documentRef: Document, pageUrl: string): InstagramFoundMedia[] {
  const found: InstagramFoundMedia[] = [];

  for (const video of Array.from(documentRef.querySelectorAll<HTMLVideoElement>('video'))) {
    const url = resolveUrl(video.getAttribute('src'), pageUrl);

    if (url) {
      found.push({ url, source: 'instagram-video-element' });
    }

    for (const source of Array.from(video.querySelectorAll<HTMLSourceElement>('source'))) {
      const sourceUrl = resolveUrl(source.getAttribute('src'), pageUrl);

      if (sourceUrl) {
        found.push({ url: sourceUrl, source: 'instagram-source-element' });
      }
    }
  }

  for (const data of findAdditionalData(documentRef)) {
    if (data.directUrl) {
      found.push({
        url: decodeInstagramUrl(data.directUrl),
        source: 'instagram-additional',
      });
    }

    appendFromMedia(
      data.graphql?.shortcode_media ?? data.shortcode_media,
      found,
      'instagram-media',
    );
  }

  return uniqueByUrl(found);
}

export function createInstagramDetector(): DetectorPlugin {
  return {
    id: pluginId,
    name: 'Instagram',
    domains: ['instagram.com'],
    capabilities: ['dom-scan', 'player-config', 'policy-warning'],
    detect: async (context) => {
      if (!context.document) {
        return [];
      }

      const media = findMedia(context.document, context.url.href);

      if (media.length === 0) {
        return [];
      }

      if (!context.isAuthorizedFixture) {
        return {
          kind: 'restriction',
          restriction: createPolicyRestriction(context, {
            status: 'unsupported',
            code: 'tos-restricted',
            message:
              'Instagram clear media evidence is emitted only for an authorized fixture.',
            sourcePluginId: pluginId,
            details: { clearMediaCount: media.length },
          }),
        };
      }

      return media.map<PluginDetectionOutput>((item) => ({
        kind: 'evidence',
        evidence: createMediaEvidence(context, {
          pluginId,
          source: item.source,
          url: item.url,
          protocol: 'direct',
          title: item.title,
          width: item.width,
          height: item.height,
          confidence: 0.7,
        }),
      }));
    },
  };
}
