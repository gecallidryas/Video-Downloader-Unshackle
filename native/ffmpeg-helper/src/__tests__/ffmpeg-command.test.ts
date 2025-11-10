import { describe, expect, it } from 'vitest';
import {
  buildExportArgs,
  buildPreviewClipArgs,
  buildProbeArgs,
  buildThumbnailArgs,
} from '../ffmpeg-command';

const directMp4 = 'https://media.example.test/video.mp4';
const hlsUrl = 'https://media.example.test/hls/master.m3u8';
const dashUrl = 'https://media.example.test/dash/manifest.mpd';

describe('ffmpeg command builder', () => {
  it('builds direct MP4 copy export args without trim', () => {
    const plan = buildExportArgs(
      {
        jobId: 'job-1',
        inputUrl: directMp4,
        protocol: 'direct',
        outputName: 'video.mp4',
        outputKind: 'original',
      },
      'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\video.mp4',
    );

    expect(plan).toEqual({
      file: 'ffmpeg',
      args: expect.arrayContaining(['-i', directMp4, '-c', 'copy']),
    });
    expect(plan.args.at(-1)).toBe('C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\video.mp4');
  });

  it('builds direct MP4 trim args after input for accurate export', () => {
    const plan = buildExportArgs(
      {
        jobId: 'job-2',
        inputUrl: directMp4,
        protocol: 'direct',
        outputName: 'clip.mp4',
        outputKind: 'mp4',
        trim: { startSec: 5, endSec: 12 },
      },
      'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\clip.mp4',
    );

    expect(plan.args.indexOf('-ss')).toBeGreaterThan(plan.args.indexOf(directMp4));
    expect(plan.args).toEqual(expect.arrayContaining(['-ss', '5', '-to', '12']));
  });

  it('builds HLS URL input args', () => {
    const plan = buildExportArgs(
      {
        jobId: 'job-3',
        inputUrl: hlsUrl,
        protocol: 'hls',
        outputName: 'hls.mp4',
        outputKind: 'mp4',
      },
      'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\hls.mp4',
    );

    expect(plan.args).toEqual(expect.arrayContaining(['-protocol_whitelist', 'file,http,https,tcp,tls,crypto']));
    expect(plan.args).toEqual(expect.arrayContaining(['-i', hlsUrl]));
  });

  it('builds DASH MPD URL input args', () => {
    const plan = buildExportArgs(
      {
        jobId: 'job-4',
        inputUrl: dashUrl,
        protocol: 'dash',
        outputName: 'dash.webm',
        outputKind: 'webm',
      },
      'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\dash.webm',
    );

    expect(plan.args).toEqual(expect.arrayContaining(['-i', dashUrl]));
    expect(plan.args).toEqual(expect.arrayContaining(['-c:v', 'libvpx-vp9', '-c:a', 'libopus']));
  });

  it('builds ffprobe args for MP4 output probing', () => {
    const plan = buildProbeArgs(directMp4);

    expect(plan).toEqual({
      file: 'ffprobe',
      args: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', directMp4],
    });
  });

  it('builds WebM output args', () => {
    const plan = buildExportArgs(
      {
        jobId: 'job-5',
        inputUrl: directMp4,
        protocol: 'direct',
        outputName: 'video.webm',
        outputKind: 'webm',
      },
      'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\video.webm',
    );

    expect(plan.args).toEqual(expect.arrayContaining(['-c:v', 'libvpx-vp9', '-c:a', 'libopus']));
  });

  it('builds MKV copy output args for subtitle-preserving exports', () => {
    const plan = buildExportArgs(
      {
        jobId: 'job-6',
        inputUrl: hlsUrl,
        protocol: 'hls',
        outputName: 'video.mkv',
        outputKind: 'mkv',
      },
      'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\video.mkv',
    );

    expect(plan.args).toEqual(expect.arrayContaining(['-map', '0', '-c', 'copy']));
    expect(plan.args.at(-1)).toBe('C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\video.mkv');
  });

  it('builds audio-only output args', () => {
    const plan = buildExportArgs(
      {
        jobId: 'job-6',
        inputUrl: directMp4,
        protocol: 'direct',
        outputName: 'audio.mp3',
        outputKind: 'audio-only',
      },
      'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\audio.mp3',
    );

    expect(plan.args).toEqual(expect.arrayContaining(['-vn', '-c:a', 'libmp3lame']));
  });

  it('builds thumbnail JPG output args', () => {
    const plan = buildThumbnailArgs(
      {
        candidateId: 'candidate-1',
        inputUrl: directMp4,
        atSec: 8,
        format: 'jpg',
      },
      'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\thumbs\\candidate-1.jpg',
    );

    expect(plan).toEqual({
      file: 'ffmpeg',
      args: expect.arrayContaining(['-ss', '8', '-i', directMp4, '-frames:v', '1', '-f', 'image2']),
    });
  });

  it('builds preview WebM and MP4 output args', () => {
    const webm = buildPreviewClipArgs(
      {
        candidateId: 'candidate-2',
        inputUrl: directMp4,
        startSec: 4,
        durationSec: 3,
        format: 'webm',
      },
      'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\previews\\candidate-2.webm',
    );
    const mp4 = buildPreviewClipArgs(
      {
        candidateId: 'candidate-3',
        inputUrl: directMp4,
        startSec: 4,
        durationSec: 3,
        format: 'mp4',
      },
      'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\previews\\candidate-3.mp4',
    );

    expect(webm.args.indexOf('-ss')).toBeLessThan(webm.args.indexOf('-i'));
    expect(webm.args).toEqual(expect.arrayContaining(['-t', '3', '-an', '-vf', 'scale=240:-1']));
    expect(webm.args).toEqual(expect.arrayContaining(['-c:v', 'libvpx-vp9']));
    expect(mp4.args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-movflags', '+faststart']));
  });

  it('builds preview GIF output args', () => {
    const plan = buildPreviewClipArgs(
      {
        candidateId: 'candidate-4',
        inputUrl: directMp4,
        durationSec: 2,
        format: 'gif',
      },
      'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\previews\\candidate-4.gif',
    );

    expect(plan.args).toEqual(expect.arrayContaining(['-t', '2', '-an', '-vf', 'fps=10,scale=240:-1:flags=lanczos']));
  });

  it('rejects invalid URLs', () => {
    expect(() => buildProbeArgs('javascript:alert(1)')).toThrow(/Unsupported input URL/);
    expect(() =>
      buildExportArgs(
        {
          jobId: 'job-7',
          inputUrl: 'not a url',
          protocol: 'direct',
          outputName: 'bad.mp4',
          outputKind: 'mp4',
        },
        'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\bad.mp4',
      ),
    ).toThrow(/Unsupported input URL/);
  });

  it('rejects unsupported output kinds', () => {
    expect(() =>
      buildExportArgs(
        {
          jobId: 'job-8',
          inputUrl: directMp4,
          protocol: 'direct',
          outputName: 'bad.mov',
          outputKind: 'mov',
        } as never,
        'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\bad.mov',
      ),
    ).toThrow(/Unsupported output kind/);
  });

  it('does not accept or return a raw command string', () => {
    expect(() => buildProbeArgs('ffmpeg -i https://media.example.test/video.mp4 out.mp4')).toThrow(
      /Unsupported input URL/,
    );

    const plan = buildProbeArgs(directMp4);
    expect(plan).not.toHaveProperty('command');
    expect(typeof plan.file).toBe('string');
    expect(Array.isArray(plan.args)).toBe(true);
  });

  it('returns plans compatible with spawn using shell false', () => {
    const plan = buildProbeArgs(directMp4);
    const spawnOptions = { shell: false as const };

    expect(() => {
      const file: string = plan.file;
      const args: readonly string[] = plan.args;
      const options: { shell: false } = spawnOptions;

      expect(file).toBe('ffprobe');
      expect(args).toContain(directMp4);
      expect(options.shell).toBe(false);
    }).not.toThrow();
  });
});
