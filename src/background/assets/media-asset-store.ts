import type {
  GeneratedAssetMimeType,
  MediaAssetDiagnostics,
  MediaAssetKind,
  MediaAssetState,
  MediaAssetStatus,
  MediaCandidate,
  NativeAssetReference,
} from '@/video_downloader_types_skeleton';

export interface StoredMediaAsset {
  cacheKey: string;
  candidateId: string;
  sourceFingerprint: string;
  kind: MediaAssetKind;
  status: MediaAssetStatus;
  assetUrl?: string;
  mimeType?: GeneratedAssetMimeType;
  error?: string;
  diagnostics?: MediaAssetDiagnostics;
  nativeAssetRef?: NativeAssetReference;
  retryAfter?: number;
  createdAt: number;
  updatedAt: number;
}

export interface MediaAssetStore {
  get(cacheKey: string): Promise<StoredMediaAsset | undefined>;
  listByCandidateId(candidateId: string): Promise<StoredMediaAsset[]>;
  set(asset: StoredMediaAsset): Promise<void>;
  delete(cacheKey: string): Promise<void>;
}

export interface MediaAssetCacheKeyInput {
  candidate: MediaCandidate;
  kind: MediaAssetKind;
  format?: string;
  startSec?: number;
  durationSec?: number;
}

export function sourceFingerprint(candidate: MediaCandidate): string {
  return [
    candidate.sourceUrl ?? '',
    candidate.manifestUrl ?? '',
    candidate.posterUrl ?? '',
    candidate.thumbnails?.heroUrl ?? '',
    candidate.durationSec ?? '',
    candidate.sizeEstimateBytes ?? '',
  ].join('|');
}

export function mediaAssetCacheKey(input: MediaAssetCacheKeyInput): string {
  const format = input.format ?? (input.kind === 'poster' ? 'jpg' : 'webm');
  return [
    sourceFingerprint(input.candidate),
    input.kind,
    format,
    input.startSec ?? '',
    input.durationSec ?? '',
  ].join('::');
}

export function storedAssetToState(asset: StoredMediaAsset): MediaAssetState {
  return {
    candidateId: asset.candidateId,
    kind: asset.kind,
    status: asset.status,
    ...(asset.assetUrl ? { assetUrl: asset.assetUrl } : {}),
    ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
    ...(asset.error ? { error: asset.error } : {}),
    ...(asset.diagnostics ? { diagnostics: asset.diagnostics } : {}),
    ...(asset.retryAfter !== undefined ? { retryAfter: asset.retryAfter } : {}),
    updatedAt: asset.updatedAt,
  };
}

export function createMemoryMediaAssetStore(): MediaAssetStore {
  const assets = new Map<string, StoredMediaAsset>();

  return {
    async get(cacheKey) {
      return assets.get(cacheKey);
    },
    async listByCandidateId(candidateId) {
      return Array.from(assets.values()).filter((asset) => asset.candidateId === candidateId);
    },
    async set(asset) {
      assets.set(asset.cacheKey, asset);
    },
    async delete(cacheKey) {
      assets.delete(cacheKey);
    },
  };
}

const STORAGE_KEY = 'unshackle:media-asset-store:v1';

export function createMediaAssetStore(): MediaAssetStore {
  const storageArea = globalThis.chrome?.storage?.local;

  if (!storageArea) {
    return createMemoryMediaAssetStore();
  }

  let assets = new Map<string, StoredMediaAsset>();
  let loading: Promise<void> | null = null;

  async function ensureLoaded(): Promise<void> {
    if (loading) {
      return loading;
    }

    loading = (async () => {
      const result = await storageArea.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY];
      if (!stored || typeof stored !== 'object') {
        assets = new Map<string, StoredMediaAsset>();
        return;
      }

      assets = new Map<string, StoredMediaAsset>(
        Object.entries(stored as Record<string, StoredMediaAsset>),
      );
    })();

    return loading;
  }

  async function persist(): Promise<void> {
    await storageArea.set({
      [STORAGE_KEY]: Object.fromEntries(assets),
    });
  }

  return {
    async get(cacheKey) {
      await ensureLoaded();
      return assets.get(cacheKey);
    },
    async listByCandidateId(candidateId) {
      await ensureLoaded();
      return Array.from(assets.values()).filter((asset) => asset.candidateId === candidateId);
    },
    async set(asset) {
      await ensureLoaded();
      assets.set(asset.cacheKey, asset);
      await persist();
    },
    async delete(cacheKey) {
      await ensureLoaded();
      assets.delete(cacheKey);
      await persist();
    },
  };
}
