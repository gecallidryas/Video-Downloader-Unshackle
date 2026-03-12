import { describe, expect, test, vi } from 'vitest';
import { createCandidateRegistry } from '@/src/background/candidates/candidate-registry';
import { createTabSnapshotStore } from '@/src/background/state/tab-snapshots';
import { createRuntimeRequest } from '@/src/shared/contracts/messages';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { createRuntimeRouter } from '../runtime-router';

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: 'Preview asset video',
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

function routerWithCandidate(
  candidateValue: MediaCandidate,
  overrides: Partial<Parameters<typeof createRuntimeRouter>[0]> = {},
) {
  const candidateRegistry = createCandidateRegistry();
  candidateRegistry.set(candidateValue.tabId, [candidateValue]);

  return createRuntimeRouter({
    candidateRegistry,
    tabSnapshots: createTabSnapshotStore(),
    ensurePreviewClip: vi.fn().mockResolvedValue({
      assetUrl: 'data:video/webm;base64,d2VibS1ieXRlcw==',
      mimeType: 'video/webm',
      generated: true,
    }),
    ensureThumbnail: vi.fn().mockResolvedValue({
      assetUrl: 'data:image/jpeg;base64,anBnLWJ5dGVz',
      mimeType: 'image/jpeg',
      generated: true,
    }),
    ...overrides,
  });
}

describe('preview asset runtime messages', () => {
  test('GET_PREVIEW_ASSET calls the native preview service', async () => {
    const router = routerWithCandidate(candidate());

    const response = await router.handleMessage(
      createRuntimeRequest('GET_PREVIEW_ASSET', { candidateId: 'candidate-1', format: 'webm' }, 'req-preview'),
    );

    expect(response).toEqual({
      type: 'GET_PREVIEW_ASSET_RESULT',
      requestId: 'req-preview',
      payload: {
        assetUrl: 'data:video/webm;base64,d2VibS1ieXRlcw==',
        mimeType: 'video/webm',
        generated: true,
      },
    });
  });

  test('GET_THUMBNAIL_ASSET calls the native thumbnail service', async () => {
    const router = routerWithCandidate(candidate());

    const response = await router.handleMessage(
      createRuntimeRequest('GET_THUMBNAIL_ASSET', { candidateId: 'candidate-1' }, 'req-thumb'),
    );

    expect(response).toEqual({
      type: 'GET_THUMBNAIL_ASSET_RESULT',
      requestId: 'req-thumb',
      payload: {
        assetUrl: 'data:image/jpeg;base64,anBnLWJ5dGVz',
        mimeType: 'image/jpeg',
        generated: true,
      },
    });
  });

  test('GET_PREVIEW_ASSET returns an error response when generation fails', async () => {
    const router = routerWithCandidate(candidate(), {
      ensurePreviewClip: vi.fn().mockRejectedValue(new Error('Preview recording failed.')),
    });

    const response = await router.handleMessage(
      createRuntimeRequest('GET_PREVIEW_ASSET', { candidateId: 'candidate-1', format: 'webm' }, 'req-preview-failed'),
    );

    expect(response).toEqual({
      type: 'ERROR',
      requestId: 'req-preview-failed',
      payload: {
        code: 'PREVIEW_ASSET_FAILED',
        message: 'Preview recording failed.',
        detail: undefined,
      },
    });
  });

  test('asset requests reject protected candidates before service invocation', async () => {
    const router = routerWithCandidate(
      candidate({ status: 'protected', protection: { kind: 'drm', drmSystems: ['widevine'] } }),
    );

    const response = await router.handleMessage(
      createRuntimeRequest('GET_PREVIEW_ASSET', { candidateId: 'candidate-1', format: 'webm' }, 'req-protected'),
    );

    expect(response).toEqual({
      type: 'ERROR',
      requestId: 'req-protected',
      payload: {
        code: 'PROTECTED_MEDIA',
        message: 'Protected media cannot generate preview assets.',
        detail: undefined,
      },
    });
  });

  test('thumbnail asset requests reject protected candidates before service invocation', async () => {
    const ensureThumbnail = vi.fn();
    const router = routerWithCandidate(
      candidate({ status: 'protected', protection: { kind: 'drm', drmSystems: ['widevine'] } }),
      { ensureThumbnail },
    );

    const response = await router.handleMessage(
      createRuntimeRequest('GET_THUMBNAIL_ASSET', { candidateId: 'candidate-1' }, 'req-thumb-protected'),
    );

    expect(response).toEqual({
      type: 'ERROR',
      requestId: 'req-thumb-protected',
      payload: {
        code: 'PROTECTED_MEDIA',
        message: 'Protected media cannot generate preview assets.',
        detail: undefined,
      },
    });
    expect(ensureThumbnail).not.toHaveBeenCalled();
  });

  test('asset requests allow unknown protection when the candidate is not marked protected', async () => {
    const ensureThumbnail = vi.fn().mockResolvedValue({
      assetUrl: 'data:image/jpeg;base64,unknown',
      mimeType: 'image/jpeg',
      generated: true,
    });
    const router = routerWithCandidate(
      candidate({
        status: 'partial',
        protocol: 'hls',
        sourceUrl: undefined,
        manifestUrl: 'https://cdn.example.com/master.m3u8',
        protection: { kind: 'unknown', reason: 'Needs classification' },
      }),
      { ensureThumbnail },
    );

    const response = await router.handleMessage(
      createRuntimeRequest('GET_THUMBNAIL_ASSET', { candidateId: 'candidate-1' }, 'req-thumb-unknown'),
    );

    expect(response).toEqual({
      type: 'GET_THUMBNAIL_ASSET_RESULT',
      requestId: 'req-thumb-unknown',
      payload: {
        assetUrl: 'data:image/jpeg;base64,unknown',
        mimeType: 'image/jpeg',
        generated: true,
      },
    });
    expect(ensureThumbnail).toHaveBeenCalledTimes(1);
  });
});
