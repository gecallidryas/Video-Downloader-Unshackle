import { describe, expect, test, vi } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { createMediaAssetService } from '../media-asset-service';
import { createMemoryMediaAssetStore, mediaAssetCacheKey } from '../media-asset-store';

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 1,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: 'Video',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('media asset service', () => {
  test('dedupes simultaneous poster jobs', async () => {
    let resolveAsset: (value: { assetUrl: string; mimeType: 'image/jpeg'; generated: true }) => void = () => {};
    const ensureThumbnail = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveAsset = resolve;
      }),
    );
    const service = createMediaAssetService({
      store: createMemoryMediaAssetStore(),
      ensureThumbnail,
    });
    const item = candidate();

    const first = service.queueAsset(item, 'poster', { priority: 'visible' });
    const second = service.queueAsset(item, 'poster', { priority: 'visible' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveAsset({ assetUrl: 'thumb.jpg', mimeType: 'image/jpeg', generated: true });

    await expect(first).resolves.toMatchObject({ status: 'ready', assetUrl: 'thumb.jpg' });
    await expect(second).resolves.toMatchObject({ status: 'ready', assetUrl: 'thumb.jpg' });
    expect(ensureThumbnail).toHaveBeenCalledTimes(1);
    expect(ensureThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'candidate-1' }),
      expect.objectContaining({ format: 'webp' }),
    );
  });

  test('records failed assets with sanitized diagnostics and retryAfter', async () => {
    const service = createMediaAssetService({
      store: createMemoryMediaAssetStore(),
      hasNativeSupport: () => true,
      now: () => 100,
      ensureThumbnail: vi.fn().mockRejectedValue(
        new Error('request failed Authorization: bearer-secret Cookie=session-secret'),
      ),
    });

    await expect(service.queueAsset(candidate(), 'poster')).resolves.toMatchObject({
      status: 'failed',
      error: 'request failed Authorization=[redacted] Cookie=[redacted]',
      retryAfter: 60_100,
      diagnostics: {
        strategy: 'native',
        inputKind: 'sourceUrl',
        retryAfter: 60_100,
      },
    });
  });

  test('returns ready asset without re-running extraction', async () => {
    const ensureThumbnail = vi.fn().mockResolvedValue({
      assetUrl: 'thumb.jpg',
      mimeType: 'image/jpeg',
      generated: true,
    });
    const service = createMediaAssetService({
      store: createMemoryMediaAssetStore(),
      ensureThumbnail,
    });
    const item = candidate();

    await service.queueAsset(item, 'poster');
    await service.queueAsset(item, 'poster');

    expect(ensureThumbnail).toHaveBeenCalledTimes(1);
  });

  test('loads cached failed state until retry timestamp expires', async () => {
    let now = 100;
    const store = createMemoryMediaAssetStore();
    const ensureThumbnail = vi.fn().mockResolvedValue({
      assetUrl: 'thumb.jpg',
      mimeType: 'image/jpeg',
      generated: true,
    });
    const failingService = createMediaAssetService({
      now: () => now,
      store,
      ensureThumbnail: vi.fn().mockRejectedValue(new Error('failed')),
    });
    const item = candidate();

    await failingService.queueAsset(item, 'poster');
    const retryingService = createMediaAssetService({ now: () => now, store, ensureThumbnail });

    await expect(retryingService.queueAsset(item, 'poster')).resolves.toMatchObject({
      status: 'failed',
    });
    now = 60_101;
    await expect(retryingService.queueAsset(item, 'poster')).resolves.toMatchObject({
      status: 'ready',
    });
    expect(ensureThumbnail).toHaveBeenCalledTimes(1);
  });

  test('restores persisted states through getState without regenerating the asset', async () => {
    const store = createMemoryMediaAssetStore();
    const item = candidate();
    const key = mediaAssetCacheKey({ candidate: item, kind: 'poster', format: 'webp' });
    await store.set({
      cacheKey: key,
      candidateId: 'candidate-1',
      sourceFingerprint: key.split('::')[0] ?? key,
      kind: 'poster',
      status: 'ready',
      assetUrl: 'thumb.jpg',
      mimeType: 'image/jpeg',
      createdAt: 1,
      updatedAt: 2,
    });

    const ensureThumbnail = vi.fn();
    const service = createMediaAssetService({ store, ensureThumbnail });

    await expect(service.getState('candidate-1')).resolves.toMatchObject([
      {
        candidateId: 'candidate-1',
        kind: 'poster',
        status: 'ready',
        assetUrl: 'thumb.jpg',
      },
    ]);
    expect(ensureThumbnail).not.toHaveBeenCalled();
  });

  test('runs visible poster jobs ahead of hover jobs queued in the same turn', async () => {
    const order: string[] = [];
    let release = Promise.resolve();
    const ensureThumbnail = vi.fn().mockImplementation(async (item: MediaCandidate) => {
      order.push(`poster:${item.id}`);
      await release;
      return {
        assetUrl: `${item.id}.jpg`,
        mimeType: 'image/jpeg' as const,
        generated: true,
      };
    });
    const ensurePreviewClip = vi.fn().mockImplementation(async (item: MediaCandidate) => {
      order.push(`hover:${item.id}`);
      return {
        assetUrl: `${item.id}.webm`,
        mimeType: 'video/webm' as const,
        generated: true,
      };
    });
    let unblock!: () => void;
    release = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const service = createMediaAssetService({
      store: createMemoryMediaAssetStore(),
      ensureThumbnail,
      ensurePreviewClip,
    });

    const hover = service.queueAsset(candidate({ id: 'hover-candidate' }), 'hoverClip', {
      priority: 'hover',
    });
    const poster = service.queueAsset(candidate({ id: 'poster-candidate' }), 'poster', {
      priority: 'visible',
    });
    unblock();

    await Promise.all([hover, poster]);

    expect(order).toEqual(['poster:poster-candidate', 'hover:hover-candidate']);
  });

  test('serves native preview metadata through the blob server', async () => {
    const nativeAssetServer = {
      serve: vi.fn().mockResolvedValue('blob:hover'),
      revoke: vi.fn(),
    };
    const service = createMediaAssetService({
      store: createMemoryMediaAssetStore(),
      hasNativeSupport: () => true,
      nativeAssetServer,
      ensurePreviewClip: vi.fn().mockResolvedValue({
        assetUrl: '',
        mimeType: 'video/webm',
        generated: true,
        nativeAssetRef: {
          outputPath: '/helper/preview.webm',
          mimeType: 'video/webm',
        },
      }),
    });

    await expect(service.queueAsset(candidate(), 'hoverClip')).resolves.toMatchObject({
      status: 'ready',
      assetUrl: 'blob:hover',
    });
    expect(nativeAssetServer.serve).toHaveBeenCalledWith(
      {
        outputPath: '/helper/preview.webm',
        mimeType: 'video/webm',
      },
      'hoverClip',
    );
  });

  test('does not persist hover preview clips in the asset store', async () => {
    const store = createMemoryMediaAssetStore();
    const service = createMediaAssetService({
      store,
      ensurePreviewClip: vi.fn().mockResolvedValue({
        assetUrl: 'data:video/webm;base64,clip',
        mimeType: 'video/webm',
        generated: true,
      }),
    });

    await expect(service.queueAsset(candidate(), 'hoverClip')).resolves.toMatchObject({
      status: 'ready',
      assetUrl: 'data:video/webm;base64,clip',
    });
    await expect(store.listByCandidateId('candidate-1')).resolves.toEqual([]);
  });
});
