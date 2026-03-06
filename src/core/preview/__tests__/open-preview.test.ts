import { describe, expect, test, vi } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { createHeroThumbnailJob } from '@/src/core/thumbs/generate-hero-thumbnail';
import { openPreview } from '../open-preview';

function buildCandidate(
  overrides: Partial<MediaCandidate> = {},
): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    pageTitle: 'Example',
    origin: 'https://example.com',
    displayName: 'Example video',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    mimeType: 'video/mp4',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

describe('openPreview', () => {
  test('routes preview requests to the offscreen host', async () => {
    const candidate = buildCandidate();
    const ensureOffscreenDocument = vi.fn().mockResolvedValue(undefined);
    const sendPreviewMessage = vi.fn().mockResolvedValue({ ok: true });

    const result = await openPreview(candidate, {
      ensureOffscreenDocument,
      sendPreviewMessage,
    });

    expect(ensureOffscreenDocument).toHaveBeenCalledWith({
      path: 'offscreen.html',
      reasons: ['DOM_SCRAPING', 'BLOBS'],
      justification: 'Render media previews outside the extension service worker.',
    });
    expect(sendPreviewMessage).toHaveBeenCalledWith({
      type: 'OPEN_PREVIEW',
      candidate,
    });
    expect(result).toEqual({ ok: true });
  });

  test('includes selected tracks and trim when opening streamed previews', async () => {
    const candidate = buildCandidate({
      protocol: 'hls',
      manifestUrl: 'https://cdn.example.com/master.m3u8',
    });
    const ensureOffscreenDocument = vi.fn().mockResolvedValue(undefined);
    const sendPreviewMessage = vi.fn().mockResolvedValue({ ok: true });

    await openPreview(candidate, {
      ensureOffscreenDocument,
      sendPreviewMessage,
    }, {
      selection: {
        mode: 'custom',
        variantId: 'v-720',
        audioTrackIds: ['audio-en'],
        subtitleTrackIds: ['subs-en'],
        trim: { startSec: 10, endSec: 20 },
      },
    });

    expect(sendPreviewMessage).toHaveBeenCalledWith({
      type: 'OPEN_PREVIEW',
      candidate,
      selection: {
        mode: 'custom',
        variantId: 'v-720',
        audioTrackIds: ['audio-en'],
        subtitleTrackIds: ['subs-en'],
        trim: { startSec: 10, endSec: 20 },
      },
    });
  });
});

describe('createHeroThumbnailJob', () => {
  test('represents thumbnail generation as queued background work', () => {
    expect(
      createHeroThumbnailJob(buildCandidate(), { now: () => 500 }),
    ).toEqual({
      id: 'thumb-candidate-1-500',
      kind: 'hero-thumbnail',
      candidateId: 'candidate-1',
      tabId: 7,
      phase: 'queued',
      createdAt: 500,
      updatedAt: 500,
    });
  });
});
