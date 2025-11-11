import { describe, expect, test } from 'vitest';
import type { SegmentDescriptor } from '@/video_downloader_types_skeleton';
import { applyUrlReplacement, computeUrlReplacement } from '../url-replacement';

function seg(index: number, url: string): SegmentDescriptor {
  return { id: `s${index}`, index, url } as SegmentDescriptor;
}

describe('url replacement', () => {
  test('computes a base substitution from an old segment URL and a new one', () => {
    const result = computeUrlReplacement({
      oldUrl: 'https://cdn-old.example.com/v1/seg-0042.ts?token=expired',
      newUrl: 'https://cdn-new.example.com/v1/seg-0042.ts?token=fresh',
    });

    expect(result).toEqual({
      oldPrefix: 'https://cdn-old.example.com/v1/',
      newPrefix: 'https://cdn-new.example.com/v1/',
      newQuery: 'token=fresh',
    });
  });

  test('rejects replacement when segment filenames do not match', () => {
    expect(() =>
      computeUrlReplacement({
        oldUrl: 'https://a/seg-1.ts',
        newUrl: 'https://b/different.ts',
      }),
    ).toThrow(/segment filename/i);
  });

  test('applies replacement to remaining segments preserving query when supplied', () => {
    const segments = [
      seg(0, 'https://cdn-old.example.com/v1/seg-0042.ts'),
      seg(1, 'https://cdn-old.example.com/v1/seg-0043.ts'),
      seg(2, 'https://other.example.com/v1/seg-0044.ts'),
    ];

    const rewritten = applyUrlReplacement(segments, {
      oldPrefix: 'https://cdn-old.example.com/v1/',
      newPrefix: 'https://cdn-new.example.com/v1/',
      newQuery: 'token=fresh',
    });

    expect(rewritten.map((segment) => segment.url)).toEqual([
      'https://cdn-new.example.com/v1/seg-0042.ts?token=fresh',
      'https://cdn-new.example.com/v1/seg-0043.ts?token=fresh',
      'https://other.example.com/v1/seg-0044.ts',
    ]);
  });

  test('omits query string when new URL has none', () => {
    const result = computeUrlReplacement({
      oldUrl: 'https://a.example.com/p/seg.ts',
      newUrl: 'https://b.example.com/p/seg.ts',
    });

    expect(result).toEqual({
      oldPrefix: 'https://a.example.com/p/',
      newPrefix: 'https://b.example.com/p/',
      newQuery: undefined,
    });

    const rewritten = applyUrlReplacement(
      [seg(0, 'https://a.example.com/p/seg-1.ts?x=1')],
      result,
    );

    expect(rewritten[0]?.url).toBe('https://b.example.com/p/seg-1.ts?x=1');
  });
});
