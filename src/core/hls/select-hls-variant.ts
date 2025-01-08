import type { DownloadSelection, MediaVariant } from '@/video_downloader_types_skeleton';
import type { ParsedHlsManifest } from './parse-hls-manifest';

function variantScore(variant: MediaVariant): number {
  return variant.bitrate ?? variant.averageBitrate ?? variant.height ?? 0;
}

export function selectHlsVariant(
  manifest: ParsedHlsManifest,
  selection: DownloadSelection = { mode: 'best' },
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

  const sorted = [...manifest.variants].sort((a, b) => {
    if (selection.mode === 'smallest') {
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
