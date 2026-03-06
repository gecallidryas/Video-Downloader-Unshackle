import { describe, expect, test } from 'vitest';
import { STREAM_CATEGORY_MESSAGES, streamCategoryMessageKey } from '../stream-categories';

describe('stream category localization keys', () => {
  test('covers protocol and subtitle stream categories with stable keys', () => {
    expect(streamCategoryMessageKey('hls')).toBe('stream.category.hls');
    expect(streamCategoryMessageKey('dash')).toBe('stream.category.dash');
    expect(streamCategoryMessageKey('hds')).toBe('stream.category.hds');
    expect(streamCategoryMessageKey('mss')).toBe('stream.category.mss');
    expect(streamCategoryMessageKey('subtitle')).toBe('stream.category.subtitle');
  });

  test('provides default English labels for all keys', () => {
    expect(STREAM_CATEGORY_MESSAGES['stream.category.hls']).toBe('HLS stream');
    expect(STREAM_CATEGORY_MESSAGES['stream.category.subtitle']).toBe('Subtitle track');
  });
});
