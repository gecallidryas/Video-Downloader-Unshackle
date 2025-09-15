import { describe, expect, test } from 'vitest';
import type { DetectedMedia } from '@/src/types/media';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  type StreamFilterField,
  type StreamFilterState,
  buildFilterContext,
  filterStreams,
  matchesStream,
} from '../streamFilter';

function makeMedia(overrides: Partial<DetectedMedia> = {}): DetectedMedia {
  return {
    id: 'm1',
    title: 'Sample Video',
    format: 'MP4',
    size: '12 MB',
    duration: '00:42',
    mediaType: 'video',
    qualities: [],
    selectedQuality: '',
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'm1',
    tabId: 1,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    pageTitle: 'Example Page',
    origin: 'https://example.com',
    displayName: 'Sample Video',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('streamFilter', () => {
  test('returns all media when query is empty', () => {
    const media = [makeMedia(), makeMedia({ id: 'm2', title: 'Other' })];
    const result = filterStreams(media, [], { query: '', fields: ['filename'] });
    expect(result).toHaveLength(2);
  });

  test('matches by filename case-insensitively', () => {
    const media = [
      makeMedia({ id: 'a', title: 'Trailer-final-cut.mp4' }),
      makeMedia({ id: 'b', title: 'Other.mp4' }),
    ];
    const result = filterStreams(media, [], {
      query: 'TRAILER',
      fields: ['filename'],
    });
    expect(result.map((m) => m.id)).toEqual(['a']);
  });

  test('matches by tab title field', () => {
    const media = [makeMedia({ id: 'a' }), makeMedia({ id: 'b' })];
    const candidates = [
      makeCandidate({ id: 'a', pageTitle: 'Live Concert' }),
      makeCandidate({ id: 'b', pageTitle: 'News Highlights' }),
    ];
    const ctx = buildFilterContext(candidates);
    const result = filterStreams(media, candidates, {
      query: 'concert',
      fields: ['tabTitle'],
    });
    expect(result.map((m) => m.id)).toEqual(['a']);
    expect(ctx.get('a')?.pageTitle).toBe('Live Concert');
  });

  test('matches by type field on protocol', () => {
    const media = [
      makeMedia({ id: 'a', protocol: 'hls' }),
      makeMedia({ id: 'b', protocol: 'dash' }),
    ];
    const result = filterStreams(media, [], {
      query: 'HLS',
      fields: ['type'],
    });
    expect(result.map((m) => m.id)).toEqual(['a']);
  });

  test('matches by hostname from candidate sourceUrl', () => {
    const media = [makeMedia({ id: 'a' }), makeMedia({ id: 'b' })];
    const candidates = [
      makeCandidate({ id: 'a', sourceUrl: 'https://cdn.alpha.com/v.mp4' }),
      makeCandidate({ id: 'b', sourceUrl: 'https://video.beta.io/v.mp4' }),
    ];
    const result = filterStreams(media, candidates, {
      query: 'beta',
      fields: ['hostname'],
    });
    expect(result.map((m) => m.id)).toEqual(['b']);
  });

  test('multi-field is OR within query, AND across separate filter states', () => {
    const media = [
      makeMedia({ id: 'a', title: 'sunset.mp4', protocol: 'hls' }),
      makeMedia({ id: 'b', title: 'sunrise.mp4', protocol: 'dash' }),
    ];
    const result = filterStreams(media, [], {
      query: 'hls',
      fields: ['filename', 'type'],
    });
    expect(result.map((m) => m.id)).toEqual(['a']);
  });

  test('matchesStream returns false when no fields specified and query non-empty', () => {
    const media = makeMedia({ title: 'anything' });
    const fields: StreamFilterField[] = [];
    const state: StreamFilterState = { query: 'any', fields };
    expect(matchesStream(media, undefined, state)).toBe(false);
  });
});
