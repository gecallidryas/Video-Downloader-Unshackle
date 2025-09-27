import { describe, expect, test } from 'vitest';
import { deriveSubtitleFilename } from '../subtitle-filename';

describe('deriveSubtitleFilename', () => {
  test('uses video base name with language and format', () => {
    expect(
      deriveSubtitleFilename({
        videoFilename: 'movie.mp4',
        language: 'en',
        format: 'vtt',
      }),
    ).toBe('movie.en.vtt');
  });

  test('strips the video extension before composing', () => {
    expect(
      deriveSubtitleFilename({
        videoFilename: 'episode-01.mkv',
        language: 'es',
        format: 'srt',
      }),
    ).toBe('episode-01.es.srt');
  });

  test('falls back to track name when language missing', () => {
    expect(
      deriveSubtitleFilename({
        videoFilename: 'show.mp4',
        trackName: 'English (Director Commentary)',
        format: 'vtt',
      }),
    ).toBe('show.english_director_commentary.vtt');
  });

  test('falls back to und when language and track name missing', () => {
    expect(
      deriveSubtitleFilename({
        videoFilename: 'show.mp4',
        format: 'vtt',
      }),
    ).toBe('show.und.vtt');
  });

  test('lowercases language tag and preserves region', () => {
    expect(
      deriveSubtitleFilename({
        videoFilename: 'film.mp4',
        language: 'PT-BR',
        format: 'vtt',
      }),
    ).toBe('film.pt-br.vtt');
  });

  test('sanitizes filesystem-hostile characters in the base name', () => {
    expect(
      deriveSubtitleFilename({
        videoFilename: 'a/b\\c:?.mp4',
        language: 'en',
        format: 'vtt',
      }),
    ).toBe('a_b_c_.en.vtt');
  });

  test('returns video.<lang>.<fmt> when video filename is missing', () => {
    expect(
      deriveSubtitleFilename({
        videoFilename: '',
        language: 'fr',
        format: 'srt',
      }),
    ).toBe('video.fr.srt');
  });
});
