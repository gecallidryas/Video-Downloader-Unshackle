import type { DownloadSelection, MediaVariant } from '@/video_downloader_types_skeleton';
import type { DefaultQualityPolicy } from '@/src/background/settings/settings-store';
import type { ParsedHlsManifest } from './parse-hls-manifest';

export interface SelectHlsVariantOptions {
  qualityPolicy?: DefaultQualityPolicy;
}

function variantScore(variant: MediaVariant): number {
  return variant.bitrate ?? variant.averageBitrate ?? variant.height ?? 0;
}

export function selectHlsVariant(
  manifest: ParsedHlsManifest,
  selection: DownloadSelection = { mode: 'best' },
  options: SelectHlsVariantOptions = {},
): MediaVariant {
  if (selection.variantId) {
    const selected = manifest.variants.find(
      (variant) => variant.id === selection.variantId,
    );

    if (!selected) {
      throw new Error(`Unknown HLS variant: ${selection.variantId}`);
    }

    return selected;
  }

  const policyMode =
    options.qualityPolicy === 'lowest'
      ? 'smallest'
      : options.qualityPolicy === 'highest'
        ? 'best'
        : selection.mode;

  const sorted = [...manifest.variants].sort((a, b) => {
    if (policyMode === 'smallest') {
      return variantScore(a) - variantScore(b);
    }

    return variantScore(b) - variantScore(a);
  });
  const selected = sorted[0];

  if (!selected) {
    throw new Error('HLS manifest does not contain any selectable variants.');
  }

  return selected;
}
