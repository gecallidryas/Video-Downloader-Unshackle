import type {
  GeneratedAssetResult,
  MediaAssetDiagnostics,
  MediaAssetKind,
  MediaAssetPriority,
  MediaAssetState,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import {
  ensureNativeThumbnail,
  type EnsureNativeThumbnailOptions,
} from '@/src/core/thumbs/native-thumbnail-service';
import {
  ensurePreviewClip,
  type EnsurePreviewClipOptions,
} from '@/src/core/preview/native-preview-service';
import type { NativeAssetServer } from './native-asset-server';
import {
  createMediaAssetStore,
  mediaAssetCacheKey,
  type MediaAssetStore,
  storedAssetToState,
} from './media-asset-store';

export const DIRECT_BROWSER_BLOB_MAX_BYTES = 25 * 1024 * 1024;
const FAILED_RETRY_DELAY_MS = 60_000;
const MAX_CONCURRENT_ASSET_JOBS = 1;

export interface MediaAssetService {
  getState(candidateId: string): Promise<MediaAssetState[]>;
  queueAsset(
    candidate: MediaCandidate,
    kind: MediaAssetKind,
    options?: { priority?: MediaAssetPriority },
  ): Promise<MediaAssetState>;
}

export interface CreateMediaAssetServiceOptions {
  now?: () => number;
  store?: MediaAssetStore;
  nativeAssetServer?: NativeAssetServer;
  ensureThumbnail?: (
    candidate: MediaCandidate,
    options: EnsureNativeThumbnailOptions,
  ) => Promise<GeneratedAssetResult>;
  ensurePreviewClip?: (
    candidate: MediaCandidate,
    options: EnsurePreviewClipOptions,
  ) => Promise<GeneratedAssetResult>;
  nativeThumbnailOptions?: EnsureNativeThumbnailOptions;
  nativePreviewOptions?: EnsurePreviewClipOptions;
  hasNativeSupport?: () => boolean;
}

type QueuedJob = {
  key: string;
  candidate: MediaCandidate;
  kind: MediaAssetKind;
  priority: MediaAssetPriority;
  resolve: (state: MediaAssetState) => void;
};

const priorityRank: Record<MediaAssetPriority, number> = {
  visible: 0,
  hover: 1,
  background: 2,
};

function isProtectedForAsset(candidate: MediaCandidate): boolean {
  return (
    candidate.status === 'protected' ||
    candidate.protection.kind === 'drm' ||
    candidate.protection.kind === 'sample-aes'
  );
}

function inputKindFor(candidate: MediaCandidate): MediaAssetDiagnostics['inputKind'] {
  return candidate.sourceUrl ? 'sourceUrl' : 'manifestUrl';
}

function strategyFor(
  candidate: MediaCandidate,
  kind: MediaAssetKind,
  hasNativeSupport: boolean,
): MediaAssetDiagnostics['strategy'] {
  if (kind === 'poster' && (candidate.thumbnails?.heroUrl || candidate.posterUrl)) {
    return 'static';
  }

  if (
    hasNativeSupport &&
    (candidate.protocol === 'direct' || candidate.protocol === 'hls' || candidate.protocol === 'dash')
  ) {
    return 'native';
  }

  if (candidate.protocol === 'hls') {
    return 'offscreen-hls';
  }

  if (candidate.protocol === 'direct') {
    return 'offscreen-direct';
  }

  return 'none';
}

function canUseOffscreenDirect(candidate: MediaCandidate): boolean {
  return (
    candidate.protocol === 'direct' &&
    typeof candidate.sizeEstimateBytes === 'number' &&
    candidate.sizeEstimateBytes <= DIRECT_BROWSER_BLOB_MAX_BYTES
  );
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(cookie|authorization)\s*[:=]\s*[^;\s]+/gi, '$1=[redacted]');
}

export function createMediaAssetService(
  options: CreateMediaAssetServiceOptions = {},
): MediaAssetService {
  const now = options.now ?? (() => Date.now());
  const store = options.store ?? createMediaAssetStore();
  const states = new Map<string, MediaAssetState>();
  const inFlight = new Map<string, Promise<MediaAssetState>>();
  const queuedJobs: QueuedJob[] = [];
  let activeJobs = 0;
  let pumpScheduled = false;
  const runThumbnail = options.ensureThumbnail ?? ensureNativeThumbnail;
  const runPreview = options.ensurePreviewClip ?? ensurePreviewClip;
  const hasNativeSupport = options.hasNativeSupport ?? (() => false);

  function keyFor(candidate: MediaCandidate, kind: MediaAssetKind): string {
    return mediaAssetCacheKey({
      candidate,
      kind,
      format: kind === 'poster' ? 'jpg' : 'webm',
      startSec: kind === 'hoverClip' ? 0 : undefined,
      durationSec: kind === 'hoverClip' ? 10 : undefined,
    });
  }

  function stateKey(candidateId: string, kind: MediaAssetKind): string {
    return `${candidateId}:${kind}`;
  }

  function revokeBlobUrl(assetUrl?: string): void {
    if (assetUrl?.startsWith('blob:')) {
      options.nativeAssetServer?.revoke(assetUrl);
    }
  }

  function setState(state: MediaAssetState): MediaAssetState {
    const key = stateKey(state.candidateId, state.kind);
    const previous = states.get(key);
    if (previous?.assetUrl && previous.assetUrl !== state.assetUrl) {
      revokeBlobUrl(previous.assetUrl);
    }
    states.set(key, state);
    return state;
  }

  async function loadStored(candidate: MediaCandidate, kind: MediaAssetKind): Promise<MediaAssetState | undefined> {
    const stored = await store.get(keyFor(candidate, kind));
    if (!stored) {
      return undefined;
    }

    if (stored.status === 'failed' && stored.retryAfter !== undefined && stored.retryAfter <= now()) {
      await store.delete(stored.cacheKey);
      return undefined;
    }

    const assetUrl =
      stored.status === 'ready' &&
      stored.nativeAssetRef &&
      (!stored.assetUrl || stored.assetUrl.startsWith('blob:'))
        ? await options.nativeAssetServer?.serve(stored.nativeAssetRef, kind)
        : stored.assetUrl;

    return setState(
      storedAssetToState({
        ...stored,
        ...(assetUrl ? { assetUrl } : {}),
      }),
    );
  }

  async function loadStoredStates(candidateId: string): Promise<void> {
    const storedStates = await store.listByCandidateId(candidateId);

    await Promise.all(
      storedStates.map(async (stored) => {
        const existing = states.get(stateKey(stored.candidateId, stored.kind));
        if (existing?.status === 'ready' || existing?.status === 'failed') {
          return;
        }

        if (stored.status === 'failed' && stored.retryAfter !== undefined && stored.retryAfter <= now()) {
          await store.delete(stored.cacheKey);
          return;
        }

        const assetUrl =
          stored.status === 'ready' &&
          stored.nativeAssetRef &&
          (!stored.assetUrl || stored.assetUrl.startsWith('blob:'))
            ? await options.nativeAssetServer?.serve(stored.nativeAssetRef, stored.kind)
            : stored.assetUrl;

        setState(
          storedAssetToState({
            ...stored,
            ...(assetUrl ? { assetUrl } : {}),
          }),
        );
      }),
    );
  }

  async function persist(
    candidate: MediaCandidate,
    state: MediaAssetState,
    generated?: GeneratedAssetResult,
  ): Promise<void> {
    const cacheKey = keyFor(candidate, state.kind);
    const existing = await store.get(cacheKey);
    await store.set({
      cacheKey,
      candidateId: state.candidateId,
      sourceFingerprint: cacheKey.split('::')[0] ?? cacheKey,
      kind: state.kind,
      status: state.status,
      ...(state.assetUrl && !state.assetUrl.startsWith('blob:') ? { assetUrl: state.assetUrl } : {}),
      ...(state.mimeType ? { mimeType: state.mimeType } : {}),
      ...(state.error ? { error: state.error } : {}),
      ...(state.diagnostics ? { diagnostics: state.diagnostics } : {}),
      ...(generated?.nativeAssetRef ? { nativeAssetRef: generated.nativeAssetRef } : {}),
      ...(state.retryAfter !== undefined ? { retryAfter: state.retryAfter } : {}),
      createdAt: existing?.createdAt ?? state.updatedAt,
      updatedAt: state.updatedAt,
    });
  }

  async function generate(candidate: MediaCandidate, kind: MediaAssetKind): Promise<MediaAssetState> {
    const startedAt = now();
    const strategy = strategyFor(candidate, kind, hasNativeSupport());
    setState({
      candidateId: candidate.id,
      kind,
      status: 'generating',
      updatedAt: startedAt,
      diagnostics: {
        strategy,
        inputKind: inputKindFor(candidate),
        elapsedMs: 0,
      },
    });

    if (isProtectedForAsset(candidate)) {
      throw new Error('Protected media cannot generate preview assets.');
    }

    let result: GeneratedAssetResult;
    if (kind === 'poster') {
      result = await runThumbnail(candidate, {
        ...(options.nativeThumbnailOptions ?? {}),
        ...(strategy === 'offscreen-hls' || strategy === 'offscreen-direct' || canUseOffscreenDirect(candidate)
          ? {}
          : { offscreenCapture: undefined }),
      });
    } else {
      result = await runPreview(candidate, {
        format: 'webm',
        ...(options.nativePreviewOptions ?? {}),
        ...(strategy === 'offscreen-hls' || strategy === 'offscreen-direct' || canUseOffscreenDirect(candidate)
          ? {}
          : { offscreenRecord: undefined }),
      });
    }

    const assetUrl =
      result.assetUrl ||
      (result.nativeAssetRef && options.nativeAssetServer
        ? await options.nativeAssetServer.serve(result.nativeAssetRef, kind)
        : result.assetUrl);

    if (!assetUrl) {
      throw new Error('Generated asset is not extension-safe yet.');
    }

    const state: MediaAssetState = {
      candidateId: candidate.id,
      kind,
      status: 'ready',
      assetUrl,
      mimeType: result.mimeType,
      updatedAt: now(),
      diagnostics: {
        strategy,
        inputKind: inputKindFor(candidate),
        elapsedMs: now() - startedAt,
      },
    };
    setState(state);
    await persist(candidate, state, result);
    return state;
  }

  async function runQueued(candidate: MediaCandidate, kind: MediaAssetKind): Promise<MediaAssetState> {
    const startedAt = now();
    try {
      return await generate(candidate, kind);
    } catch (error) {
      const retryAfter = now() + FAILED_RETRY_DELAY_MS;
      const state: MediaAssetState = {
        candidateId: candidate.id,
        kind,
        status: 'failed',
        error: sanitizeError(error),
        retryAfter,
        updatedAt: now(),
        diagnostics: {
          strategy: strategyFor(candidate, kind, hasNativeSupport()),
          inputKind: inputKindFor(candidate),
          elapsedMs: now() - startedAt,
          errorCode: error instanceof Error ? error.name : 'Error',
          retryAfter,
        },
      };
      setState(state);
      await persist(candidate, state);
      return state;
    }
  }

  function schedulePump(): void {
    if (pumpScheduled) {
      return;
    }

    pumpScheduled = true;
    setTimeout(() => {
      pumpScheduled = false;
      void pumpQueue();
    }, 0);
  }

  async function pumpQueue(): Promise<void> {
    while (activeJobs < MAX_CONCURRENT_ASSET_JOBS && queuedJobs.length > 0) {
      queuedJobs.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
      const nextJob = queuedJobs.shift();
      if (!nextJob) {
        return;
      }

      activeJobs += 1;
      void runQueued(nextJob.candidate, nextJob.kind)
        .then(nextJob.resolve)
        .finally(() => {
          inFlight.delete(nextJob.key);
          activeJobs = Math.max(0, activeJobs - 1);
          schedulePump();
        });
    }
  }

  function enqueue(candidate: MediaCandidate, kind: MediaAssetKind, priority: MediaAssetPriority): Promise<MediaAssetState> {
    const key = keyFor(candidate, kind);
    const promise = new Promise<MediaAssetState>((resolve) => {
      queuedJobs.push({
        key,
        candidate,
        kind,
        priority,
        resolve,
      });
    });

    inFlight.set(key, promise);
    schedulePump();
    return promise;
  }

  return {
    async getState(candidateId) {
      await loadStoredStates(candidateId);
      return Array.from(states.values()).filter((state) => state.candidateId === candidateId);
    },

    async queueAsset(candidate, kind, assetOptions = {}) {
      const key = keyFor(candidate, kind);
      const current = states.get(stateKey(candidate.id, kind));
      if (current?.status === 'ready' || current?.status === 'queued' || current?.status === 'generating') {
        return current;
      }
      if (current?.status === 'failed' && current.retryAfter !== undefined && current.retryAfter > now()) {
        return current;
      }
      if (current?.status === 'failed' && current.retryAfter !== undefined && current.retryAfter <= now()) {
        states.delete(stateKey(candidate.id, kind));
      }

      const stored = await loadStored(candidate, kind);
      if (stored?.status === 'ready' || stored?.status === 'failed') {
        return stored;
      }

      const existing = inFlight.get(key);
      if (existing) {
        return existing;
      }

      setState({
        candidateId: candidate.id,
        kind,
        status: 'queued',
        updatedAt: now(),
      });

      return enqueue(candidate, kind, assetOptions.priority ?? 'background');
    },
  };
}
