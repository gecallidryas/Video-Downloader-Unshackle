import { describe, expect, test } from 'vitest';
import { selectAudioByLanguage } from '../select-audio-by-language';

const tracks = [
  { id: 'a1', language: 'en' },
  { id: 'a2', language: 'es' },
  { id: 'a3', language: 'fr' },
  { id: 'a4', language: 'en-US' },
];

describe('selectAudioByLanguage', () => {
  test('returns null when no tracks supplied', () => {
    expect(selectAudioByLanguage([], 'en')).toBeNull();
  });

  test('returns null when no preference set', () => {
    expect(selectAudioByLanguage(tracks, '')).toBeNull();
  });

  test('matches exact language code', () => {
    expect(selectAudioByLanguage(tracks, 'es')?.id).toBe('a2');
  });

  test('matches case-insensitively', () => {
    expect(selectAudioByLanguage(tracks, 'EN')?.id).toBe('a1');
  });

  test('matches primary subtag when full tag absent', () => {
    expect(selectAudioByLanguage(tracks, 'en-GB')?.id).toBe('a1');
  });

  test('matches when track has region tag and preference is base', () => {
    const onlyRegional = [{ id: 'r1', language: 'en-US' }];
    expect(selectAudioByLanguage(onlyRegional, 'en')?.id).toBe('r1');
  });

  test('returns null when no match', () => {
    expect(selectAudioByLanguage(tracks, 'ja')).toBeNull();
  });
});
