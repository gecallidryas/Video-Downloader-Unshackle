import { describe, expect, test } from 'vitest';
import { verifySubtitleTrack } from '../verify-subtitles';

describe('verifySubtitleTrack', () => {
  test('reports embedded when probe shows subtitle stream', () => {
    expect(
      verifySubtitleTrack({
        streams: [
          { codec_type: 'video' },
          { codec_type: 'audio' },
          { codec_type: 'subtitle', codec_name: 'webvtt' },
        ],
      }),
    ).toEqual({ status: 'embedded', codec: 'webvtt' });
  });

  test('reports missing when subtitles were expected but not present', () => {
    expect(
      verifySubtitleTrack({
        streams: [{ codec_type: 'video' }, { codec_type: 'audio' }],
      }),
    ).toEqual({ status: 'missing' });
  });

  test('reports missing when streams array is absent', () => {
    expect(verifySubtitleTrack({})).toEqual({ status: 'missing' });
  });

  test('returns the codec_name of the first subtitle stream when multiple present', () => {
    expect(
      verifySubtitleTrack({
        streams: [
          { codec_type: 'subtitle', codec_name: 'webvtt' },
          { codec_type: 'subtitle', codec_name: 'srt' },
        ],
      }),
    ).toEqual({ status: 'embedded', codec: 'webvtt' });
  });
});
