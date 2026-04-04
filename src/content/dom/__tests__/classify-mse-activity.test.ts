import { describe, expect, test } from 'vitest';
import { classifyMseActivity } from '../blob-m3u8-scanner';

describe('classifyMseActivity — MediaSource/appendBuffer detection', () => {
  test('flags MSE usage and preserves the source mime', () => {
    expect(classifyMseActivity('video/mp4; codecs="avc1.640028,mp4a.40.2"')).toEqual(
      {
        usingMediaSource: true,
        sourceMimeType: 'video/mp4',
        protocol: undefined,
      },
    );
  });

  test('infers HLS protocol when the source mime is an HLS manifest type', () => {
    expect(classifyMseActivity('application/vnd.apple.mpegurl')).toEqual({
      usingMediaSource: true,
      sourceMimeType: 'application/vnd.apple.mpegurl',
      protocol: 'hls',
    });
  });

  test('infers DASH protocol when the source mime is a DASH manifest type', () => {
    expect(classifyMseActivity('application/dash+xml')?.protocol).toBe('dash');
  });

  test('still flags MSE usage when mime is missing (codec container unknown)', () => {
    expect(classifyMseActivity(undefined)).toEqual({
      usingMediaSource: true,
      sourceMimeType: undefined,
      protocol: undefined,
    });
  });
});
