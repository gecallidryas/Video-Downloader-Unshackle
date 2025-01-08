import type { DownloadSelection, MediaVariant } from '@/video_downloader_types_skeleton';
import type {
  ParsedDashManifest,
  ParsedDashRepresentation,
} from './parse-mpd';

function variantScore(variant: MediaVariant): number {
  return variant.bitrate ?? variant.height ?? 0;
}

export function selectDashRepresentation(
  manifest: ParsedDashManifest,
  selection: DownloadSelection = { mode: 'best' },
): ParsedDashRepresentation {
  const selectedVariant = selection.variantId
    ? manifest.variants.find((variant) => variant.id === selection.variantId)
    : [...manifest.variants].sort((a, b) =>
        selection.mode === 'smallest'
          ? variantScore(a) - variantScore(b)
          : variantScore(b) - variantScore(a),
      )[0];

  if (!selectedVariant) {
    throw new Error('DASH manifest does not contain any selectable video representations.');
  }

  const representation = manifest.representations.find(
    (item) => item.id === selectedVariant.id,
  );

  if (!representation) {
    throw new Error(`Missing DASH segment metadata for representation: ${selectedVariant.id}`);
  }

  return representation;
}
