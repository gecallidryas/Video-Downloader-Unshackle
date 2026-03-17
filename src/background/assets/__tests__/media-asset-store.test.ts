import { describe, expect, test } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  createMemoryMediaAssetStore,
  mediaAssetCacheKey,
} from '../media-asset-store';

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

describe('media asset store', () => {
  test('stores ready asset metadata by stable cache key', async () => {
    const store = createMemoryMediaAssetStore();
    const cacheKey = mediaAssetCacheKey({ candidate: candidate(), kind: 'poster', format: 'jpg' });

    await store.set({
      cacheKey,
      candidateId: 'candidate-1',
      sourceFingerprint: 'source',
      kind: 'poster',
      status: 'ready',
      assetUrl: 'thumb.jpg',
      mimeType: 'image/jpeg',
      createdAt: 1,
      updatedAt: 2,
    });

    await expect(store.get(cacheKey)).resolves.toMatchObject({
      cacheKey,
      status: 'ready',
      assetUrl: 'thumb.jpg',
    });
  });

  test('cache key includes source, kind, format, start, and duration', () => {
    const first = mediaAssetCacheKey({
      candidate: candidate({ sourceUrl: 'https://cdn.example.com/a.mp4' }),
      kind: 'hoverClip',
      format: 'webm',
      startSec: 1,
      durationSec: 3,
    });
    const second = mediaAssetCacheKey({
      candidate: candidate({ sourceUrl: 'https://cdn.example.com/b.mp4' }),
      kind: 'hoverClip',
      format: 'webm',
      startSec: 1,
      durationSec: 3,
    });

    expect(first).not.toBe(second);
    expect(first).toContain('hoverClip::webm::1::3');
  });

  test('stores failed state with retry timestamp', async () => {
    const store = createMemoryMediaAssetStore();
    const cacheKey = mediaAssetCacheKey({ candidate: candidate(), kind: 'poster' });

    await store.set({
      cacheKey,
      candidateId: 'candidate-1',
      sourceFingerprint: 'source',
      kind: 'poster',
      status: 'failed',
      error: 'capture failed',
      retryAfter: 123,
      createdAt: 1,
      updatedAt: 2,
    });

    await expect(store.get(cacheKey)).resolves.toMatchObject({
      status: 'failed',
      retryAfter: 123,
    });
    expect(cacheKey).toContain('poster::webp::');
  });
});
