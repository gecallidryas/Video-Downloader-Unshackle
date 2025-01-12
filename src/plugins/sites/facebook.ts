import type {
  DetectorPlugin,
  PluginDetectionOutput,
} from '@/src/core/plugins/detector-plugin';
import {
  createMediaEvidence,
  createPolicyRestriction,
  firstMetaContent,
  resolveUrl,
  safeParseJson,
  scriptTexts,
  uniqueByUrl,
} from './base-detector';

const pluginId = 'facebook';

interface FacebookMedia {
  url: string;
  source: string;
  quality?: string;
  title?: string;
}

function decodeEscapedUrl(value: string): string {
  return value.replace(/\\\//g, '/').replace(/\\u0026/g, '&');
}

function findMedia(documentRef: Document, pageUrl: string): FacebookMedia[] {
  const found: FacebookMedia[] = [];
  const title = firstMetaContent(documentRef, [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ]);

  for (const text of scriptTexts(documentRef)) {
    const videoDataMatches = text.matchAll(/"video_data"\s*:\s*(\[[\s\S]*?\])/g);

    for (const match of videoDataMatches) {
      const data = match[1] ? safeParseJson<Array<Record<string, string>>>(match[1]) : undefined;

      for (const item of data ?? []) {
        const sd = item.sd_src || item.sd_src_no_ratelimit;
        const hd = item.hd_src || item.hd_src_no_ratelimit;

        if (sd) {
          found.push({
            url: decodeEscapedUrl(sd),
            source: 'facebook-sd',
            quality: 'SD',
            title: item.title ?? title,
          });
        }

        if (hd) {
          found.push({
            url: decodeEscapedUrl(hd),
            source: 'facebook-hd',
            quality: 'HD',
            title: item.title ?? title,
          });
        }
      }
    }

    const sdMatch = text.match(/"sd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/);
    const hdMatch = text.match(/"hd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/);

    if (sdMatch?.[1]) {
      found.push({
        url: decodeEscapedUrl(sdMatch[1]),
        source: 'facebook-sd',
        quality: 'SD',
        title,
      });
    }

    if (hdMatch?.[1]) {
      found.push({
        url: decodeEscapedUrl(hdMatch[1]),
        source: 'facebook-hd',
        quality: 'HD',
        title,
      });
    }
  }

  for (const element of Array.from(documentRef.querySelectorAll('[data-store]'))) {
    const store = safeParseJson<{ videoURL?: string }>(
      element.getAttribute('data-store') || '{}',
    );
    const url = resolveUrl(store?.videoURL, pageUrl);

    if (url) {
      found.push({ url, source: 'facebook-datastore', title });
    }
  }

  const ogVideo = resolveUrl(
    firstMetaContent(documentRef, ['meta[property="og:video"]']),
    pageUrl,
  );

  if (ogVideo) {
    found.push({ url: ogVideo, source: 'facebook-og', title });
  }

  return uniqueByUrl(found);
}

export function createFacebookDetector(): DetectorPlugin {
  return {
    id: pluginId,
    name: 'Facebook',
    domains: [
      'facebook.com',
      'fb.watch',
      'm.facebook.com',
      'web.facebook.com',
    ],
    capabilities: ['player-config', 'policy-warning'],
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
              'Facebook clear media evidence is emitted only for an authorized fixture.',
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
          quality: item.quality,
          confidence: 0.72,
        }),
      }));
    },
  };
}
