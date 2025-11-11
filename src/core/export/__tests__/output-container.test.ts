import { describe, expect, test } from 'vitest';
import { resolveOutputContainer } from '../output-container';

describe('resolveOutputContainer', () => {
  test('returns mkv when subtitles are included', () => {
    expect(resolveOutputContainer({ hasSubtitles: true })).toBe('mkv');
  });

  test('returns mp4 when subtitles are not included', () => {
    expect(resolveOutputContainer({ hasSubtitles: false })).toBe('mp4');
  });

  test('honors explicit overrides regardless of subtitle presence', () => {
    expect(resolveOutputContainer({ hasSubtitles: true, override: 'mp4' })).toBe('mp4');
    expect(resolveOutputContainer({ hasSubtitles: false, override: 'mkv' })).toBe('mkv');
    expect(resolveOutputContainer({ hasSubtitles: true, override: 'webm' })).toBe('webm');
  });

  test('treats explicit override of auto as automatic decision', () => {
    expect(resolveOutputContainer({ hasSubtitles: true, override: 'auto' })).toBe('mkv');
    expect(resolveOutputContainer({ hasSubtitles: false, override: 'auto' })).toBe('mp4');
  });
});
