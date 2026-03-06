import { afterEach, describe, expect, test, vi } from 'vitest';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  createRuntimeErrorResponse,
  createRuntimeRequest,
  createRuntimeResponse,
} from '../messages';
import {
  isRuntimeErrorResponse,
  type RuntimeRequestOf,
  type RuntimeResponseOf,
} from '../runtime';
import { toDetectedMedia } from '../../adapters/media-card';

function buildCandidate(
  overrides: Partial<MediaCandidate> = {},
): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 42,
    mediaKind: 'video',
    protocol: 'hls',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    pageTitle: 'Example Page',
    origin: 'https://example.com',
    displayName: 'Example Stream',
    manifestUrl: 'https://example.com/master.m3u8',
    mimeType: 'application/vnd.apple.mpegurl',
    durationSec: 3723,
    width: 1920,
    height: 1080,
    sizeEstimateBytes: 512_000_000,
    protection: { kind: 'none' },
    variants: [
      {
        id: 'v1',
        height: 1080,
        width: 1920,
        bitrate: 4_500_000,
        isDefault: true,
      },
      {
        id: 'v2',
        height: 720,
        width: 1280,
        bitrate: 2_500_000,
      },
    ],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'hls.js' },
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe('runtime message helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('creates typed runtime requests and responses', () => {
    const request = createRuntimeRequest('GET_CANDIDATES', { tabId: 42 }, 'req-1');
    const response = createRuntimeResponse(
      'GET_CANDIDATES_RESULT',
      { candidates: [buildCandidate()] },
      request.requestId,
    );

    const typedRequest: RuntimeRequestOf<'GET_CANDIDATES'> = request;
    const typedResponse: RuntimeResponseOf<'GET_CANDIDATES_RESULT'> = response;

    expect(typedRequest.payload.tabId).toBe(42);
    expect(typedResponse.payload.candidates).toHaveLength(1);
    expect(typedResponse.requestId).toBe('req-1');
  });

  test('creates typed runtime error responses', () => {
    const errorResponse = createRuntimeErrorResponse(
      'PROTECTED_MEDIA',
      'Blocked by protection policy',
      'req-2',
    );

    expect(isRuntimeErrorResponse(errorResponse)).toBe(true);
    expect(errorResponse.payload.code).toBe('PROTECTED_MEDIA');
    expect(errorResponse.payload.message).toMatch(/blocked/i);
  });

  test('generates unique fallback request ids even when the clock does not advance', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);

    const first = createRuntimeRequest('GET_CANDIDATES', { tabId: 42 });
    const second = createRuntimeRequest('GET_CANDIDATES', { tabId: 42 });

    expect(first.requestId).not.toBe(second.requestId);
  });
});

describe('media card adapter', () => {
  test('maps a clear media candidate into media-card display fields', () => {
    const adapted = toDetectedMedia(buildCandidate());
    const primaryAction = adapted.primaryAction;

    expect(adapted.title).toBe('Example Stream');
    expect(adapted.url).toBe('https://example.com/master.m3u8');
    expect(adapted.format).toBe('HLS');
    expect(adapted.categoryLabel).toBe('HLS stream');
    expect(adapted.size).toBe('512 MB');
    expect(adapted.duration).toBe('1:02:03');
    expect(adapted.selectedQuality).toBe('v1');
    expect(adapted.qualities).toEqual([
      { label: '1080p', value: 'v1' },
      { label: '720p', value: 'v2' },
    ]);
    expect(primaryAction).toBeDefined();
    if (!primaryAction) {
      throw new Error('Expected a primary action for clear media');
    }
    expect(primaryAction.kind).toBe('download');
    expect(primaryAction.label).toBe('Download');
  });

  test('maps protected candidates to a blocked primary action', () => {
    const adapted = toDetectedMedia(
      buildCandidate({
        status: 'protected',
        protection: {
          kind: 'drm',
          reason: 'Widevine license required',
        },
      }),
    );
    const primaryAction = adapted.primaryAction;
    const protection = adapted.protection;

    expect(primaryAction).toBeDefined();
    expect(protection).toBeDefined();
    if (!primaryAction || !protection) {
      throw new Error('Expected protected media to keep action and protection metadata');
    }
    expect(primaryAction.kind).toBe('blocked');
    expect(primaryAction.label).toBe('Protected Media');
    expect(protection.kind).toBe('drm');
  });

  test('preserves distinct variants that share the same base quality label', () => {
    const adapted = toDetectedMedia(
      buildCandidate({
        variants: [
          {
            id: 'v1',
            height: 1080,
            width: 1920,
            bitrate: 4_500_000,
            isDefault: true,
          },
          {
            id: 'v2',
            height: 1080,
            width: 1920,
            bitrate: 3_000_000,
          },
        ],
      }),
    );

    expect(adapted.qualities).toHaveLength(2);
    expect(adapted.qualities.map((quality) => quality.value)).toEqual(['v1', 'v2']);
    expect(adapted.qualities[0].label).toMatch(/^1080p/);
    expect(adapted.qualities[1].label).toMatch(/^1080p/);
  });

  test('labels generated media-playlist quality as Auto instead of exposing the variant id', () => {
    const adapted = toDetectedMedia(
      buildCandidate({
        variants: [
          {
            id: 'media-playlist',
            isDefault: true,
          },
        ],
      }),
    );

    expect(adapted.qualities).toEqual([{ label: 'Auto', value: 'media-playlist' }]);
    expect(adapted.selectedQuality).toBe('media-playlist');
  });
});
