import type {
  DetectorPlugin,
  PluginDetectionOutput,
} from '@/src/core/plugins/detector-plugin';
import {
  createMediaEvidence,
  createPolicyRestriction,
  safeParseJson,
  scriptTexts,
} from './base-detector';

const pluginId = 'youtube';

interface YouTubeFormat {
  url?: string;
  signatureCipher?: string;
  cipher?: string;
  quality?: string;
  qualityLabel?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  bitrate?: number;
}

interface YouTubePlayerResponse {
  videoDetails?: {
    title?: string;
    lengthSeconds?: string;
    isLiveContent?: boolean;
  };
  playabilityStatus?: {
    status?: string;
    reason?: string;
    messages?: string[];
  };
  streamingData?: {
    adaptiveFormats?: YouTubeFormat[];
    formats?: YouTubeFormat[];
    hlsManifestUrl?: string;
    dashManifestUrl?: string;
  };
}

function parsePlayerResponse(documentRef: Document): YouTubePlayerResponse | undefined {
  for (const text of scriptTexts(documentRef)) {
    const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;/);

    if (match?.[1]) {
      const parsed = safeParseJson<YouTubePlayerResponse>(match[1]);

      if (parsed) {
        return parsed;
      }
    }
  }

  return undefined;
}

function formatIsEncrypted(format: YouTubeFormat): boolean {
  return Boolean(format.signatureCipher || format.cipher);
}

function playabilityRestrictionCode(status: string | undefined, reason: string | undefined) {
  if (status === 'LOGIN_REQUIRED') {
    return 'login-required' as const;
  }

  if (status === 'CONTENT_CHECK_REQUIRED') {
    return 'age-restricted' as const;
  }

  if (status === 'UNPLAYABLE' && /country|region/i.test(reason ?? '')) {
    return 'geo-restricted' as const;
  }

  return 'tos-restricted' as const;
}

export function createYouTubeDetector(): DetectorPlugin {
  return {
    id: pluginId,
    name: 'YouTube',
    domains: ['youtube.com', 'youtu.be', 'm.youtube.com'],
    capabilities: ['player-config', 'policy-warning'],
    detect: async (context) => {
      if (!context.document) {
        return [];
      }

      const response = parsePlayerResponse(context.document);

      if (!response) {
        return [];
      }

      const title = response.videoDetails?.title;
      const allFormats = [
        ...(response.streamingData?.adaptiveFormats ?? []),
        ...(response.streamingData?.formats ?? []),
      ];
      const encryptedFormats = allFormats.filter(formatIsEncrypted);
      const clearFormats = allFormats.filter(
        (format) => !formatIsEncrypted(format) && Boolean(format.url),
      );
      const manifestUrls = [
        response.streamingData?.hlsManifestUrl,
        response.streamingData?.dashManifestUrl,
      ].filter((url): url is string => Boolean(url));
      const playabilityStatus = response.playabilityStatus;
      const playable = !playabilityStatus || playabilityStatus.status === 'OK';

      if (!playable) {
        const reason =
          playabilityStatus?.reason || playabilityStatus?.messages?.[0] || 'Playback restricted.';

        return {
          kind: 'restriction',
          restriction: createPolicyRestriction(context, {
            status: 'unsupported',
            code: playabilityRestrictionCode(playabilityStatus?.status, reason),
            message: `${title ?? 'This video'}: ${reason}`,
            sourcePluginId: pluginId,
            details: { title },
          }),
        };
      }

      const outputs: PluginDetectionOutput[] = clearFormats.map((format) => ({
        kind: 'evidence',
        evidence: createMediaEvidence(context, {
          pluginId,
          source: 'youtube-clear-format',
          url: format.url!,
          protocol: 'direct',
          title,
          quality: format.qualityLabel ?? format.quality,
          width: format.width,
          height: format.height,
          bitrate: format.bitrate,
          mimeType: format.mimeType,
          confidence: 0.72,
        }),
      }));

      for (const url of manifestUrls) {
        outputs.push({
          kind: 'evidence',
          evidence: createMediaEvidence(context, {
            pluginId,
            source: url.includes('.mpd') ? 'youtube-dash' : 'youtube-hls',
            url,
            protocol: url.includes('.mpd') ? 'dash' : 'hls',
            title,
            confidence: 0.72,
          }),
        });
      }

      if (outputs.length === 0 && encryptedFormats.length > 0) {
        return {
          kind: 'restriction',
          restriction: createPolicyRestriction(context, {
            status: 'unsupported',
            code: 'signature-required',
            message:
              'YouTube streams require signature decryption; no clear formats available.',
            sourcePluginId: pluginId,
            details: { title, encryptedCount: encryptedFormats.length },
          }),
        };
      }

      return outputs;
    },
  };
}
