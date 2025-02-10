import type { PreviewAsset } from './native-preview-service';

const previewAssets = new Map<string, PreviewAsset>();

export function previewCacheKey(input: {
  candidateId: string;
  format: string;
  startSec: number;
  durationSec: number;
}): string {
  return `${input.candidateId}:${input.format}:${input.startSec}:${input.durationSec}`;
}

export function getPreviewAsset(key: string): PreviewAsset | undefined {
  return previewAssets.get(key);
}

export function getLatestPreviewAsset(candidateId: string): PreviewAsset | undefined {
  for (const [key, value] of previewAssets) {
    if (key.startsWith(`${candidateId}:`)) {
      return value;
    }
  }

  return undefined;
}

export function setPreviewAsset(key: string, asset: PreviewAsset): PreviewAsset {
  previewAssets.set(key, asset);

  return asset;
}

export function clearPreviewAssets(candidateId?: string): void {
  if (!candidateId) {
    previewAssets.clear();
    return;
  }

  for (const key of previewAssets.keys()) {
    if (key.startsWith(`${candidateId}:`)) {
      previewAssets.delete(key);
    }
  }
}
