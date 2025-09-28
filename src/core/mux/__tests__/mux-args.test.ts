import { describe, expect, test } from 'vitest';
import { buildMuxArgs } from '../mux-args';

describe('buildMuxArgs', () => {
  test('single combined input copies all streams without -shortest', () => {
    const args = buildMuxArgs({
      inputs: [{ path: 'video.ts', hasAudio: true, hasVideo: true }],
      hasSubtitles: false,
      container: 'mp4',
    });

    expect(args).toEqual(['-i', 'video.ts', '-map', '0', '-c', 'copy', 'output.mp4']);
  });

  test('video-only input with embedded audio preserves all streams via -map 0 -c copy', () => {
    const args = buildMuxArgs({
      inputs: [{ path: 'video.ts', hasAudio: true, hasVideo: true }],
      hasSubtitles: false,
      container: 'mp4',
    });

    expect(args).toContain('-map');
    expect(args).toContain('0');
    expect(args).toContain('-c');
    expect(args).toContain('copy');
    expect(args).not.toContain('-shortest');
  });

  test('separate audio + video inputs add -shortest', () => {
    const args = buildMuxArgs({
      inputs: [
        { path: 'video.m4s', hasAudio: false, hasVideo: true },
        { path: 'audio.m4s', hasAudio: true, hasVideo: false },
      ],
      hasSubtitles: false,
      container: 'mp4',
    });

    expect(args).toEqual([
      '-i',
      'video.m4s',
      '-i',
      'audio.m4s',
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c',
      'copy',
      '-shortest',
      'output.mp4',
    ]);
  });

  test('mkv with subtitles maps subtitle stream and copies codecs', () => {
    const args = buildMuxArgs({
      inputs: [
        { path: 'video.m4s', hasAudio: false, hasVideo: true },
        { path: 'audio.m4s', hasAudio: true, hasVideo: false },
        { path: 'subs.vtt', hasSubtitles: true },
      ],
      hasSubtitles: true,
      container: 'mkv',
    });

    expect(args).toEqual([
      '-i',
      'video.m4s',
      '-i',
      'audio.m4s',
      '-i',
      'subs.vtt',
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-map',
      '2:s',
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      '-c:s',
      'copy',
      '-shortest',
      'output.mkv',
    ]);
  });

  test('output name is configurable', () => {
    const args = buildMuxArgs({
      inputs: [{ path: 'video.ts', hasAudio: true, hasVideo: true }],
      hasSubtitles: false,
      container: 'mp4',
      outputName: 'myfile.mp4',
    });

    expect(args.at(-1)).toBe('myfile.mp4');
  });
});
