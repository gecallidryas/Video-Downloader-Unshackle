import { describe, expect, it } from 'vitest';
import { buildYtDlpArgs, extensionForYtDlpQuality, YTDLP_PROGRESS_PREFIX } from '../ytdlp-command';

const OUTPUT = 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\clip.mp4';

describe('buildYtDlpArgs', () => {
  it('builds a single-item download with a parseable progress template and url after --', () => {
    const plan = buildYtDlpArgs(
      { jobId: 'j', inputUrl: 'https://example.com/watch?v=abc', outputName: 'clip.mp4', quality: 'best-mp4' },
      { outputPath: OUTPUT },
    );

    expect(plan.file).toBe('yt-dlp');
    expect(plan.outputPath).toBe(OUTPUT);
    expect(plan.args).toContain('--no-playlist');
    expect(plan.args).toContain('--newline');
    const templateIndex = plan.args.indexOf('--progress-template');
    expect(templateIndex).toBeGreaterThanOrEqual(0);
    expect(plan.args[templateIndex + 1]).toContain(YTDLP_PROGRESS_PREFIX);
    expect(plan.args.slice(-4)).toEqual(['-o', OUTPUT, '--', 'https://example.com/watch?v=abc']);
  });

  it('selects mp4 merge for best-mp4 and audio extraction for audio-only', () => {
    const mp4 = buildYtDlpArgs(
      { jobId: 'j', inputUrl: 'https://example.com/v', outputName: 'c.mp4', quality: 'best-mp4' },
      { outputPath: OUTPUT },
    );
    expect(mp4.args).toContain('--merge-output-format');
    expect(mp4.args).toContain('mp4');

    const audioPath = OUTPUT.replace('clip.mp4', 'clip.mp3');
    const audio = buildYtDlpArgs(
      { jobId: 'j', inputUrl: 'https://example.com/v', outputName: 'c.mp3', quality: 'audio-only' },
      { outputPath: audioPath },
    );
    expect(audio.args).toContain('-x');
    expect(audio.args).toEqual(expect.arrayContaining(['--audio-format', 'mp3']));
    expect(extensionForYtDlpQuality('audio-only')).toBe('mp3');
    expect(extensionForYtDlpQuality('best')).toBe('mp4');
  });

  it('passes only token-safe headers via --add-header and drops CRLF-injected values', () => {
    const plan = buildYtDlpArgs(
      {
        jobId: 'j',
        inputUrl: 'https://example.com/v',
        outputName: 'c.mp4',
        quality: 'best',
        headers: {
          Referer: 'https://example.com/watch',
          Cookie: 'session=1',
          'Bad Name': 'x',
          Evil: 'a\r\nInjected: 1',
        },
      },
      { outputPath: OUTPUT },
    );

    expect(plan.args).toEqual(expect.arrayContaining(['--add-header', 'Referer:https://example.com/watch']));
    expect(plan.args).toEqual(expect.arrayContaining(['--add-header', 'Cookie:session=1']));
    expect(plan.args.join(' ')).not.toContain('Bad Name');
    expect(plan.args.join(' ')).not.toContain('Injected');
  });

  it('encodes trim as a keyframe-accurate download section', () => {
    const plan = buildYtDlpArgs(
      { jobId: 'j', inputUrl: 'https://example.com/v', outputName: 'c.mp4', quality: 'best', trim: { startSec: 5, endSec: 12 } },
      { outputPath: OUTPUT },
    );

    expect(plan.args).toEqual(expect.arrayContaining(['--download-sections', '*5-12', '--force-keyframes-at-cuts']));
  });

  it('adds subtitle language selection with embed vs sidecar mode', () => {
    const embed = buildYtDlpArgs(
      { jobId: 'j', inputUrl: 'https://example.com/v', outputName: 'c.mp4', quality: 'best', subtitleLanguages: ['en', 'es'], embedSubtitles: true },
      { outputPath: OUTPUT },
    );
    expect(embed.args).toEqual(expect.arrayContaining(['--sub-langs', 'en,es', '--embed-subs']));

    const sidecar = buildYtDlpArgs(
      { jobId: 'j', inputUrl: 'https://example.com/v', outputName: 'c.mp4', quality: 'best', subtitleLanguages: ['en'], writeSubtitles: true },
      { outputPath: OUTPUT },
    );
    expect(sidecar.args).toContain('--write-subs');
    expect(sidecar.args).not.toContain('--embed-subs');

    const both = buildYtDlpArgs(
      { jobId: 'j', inputUrl: 'https://example.com/v', outputName: 'c.mp4', quality: 'best', subtitleLanguages: ['all'], embedSubtitles: true, writeSubtitles: true },
      { outputPath: OUTPUT },
    );
    expect(both.args).toEqual(expect.arrayContaining(['--sub-langs', 'all', '--write-subs', '--embed-subs']));

    const defaulted = buildYtDlpArgs(
      { jobId: 'j', inputUrl: 'https://example.com/v', outputName: 'c.mp4', quality: 'best', subtitleLanguages: ['en'] },
      { outputPath: OUTPUT },
    );
    expect(defaulted.args).toContain('--write-subs');
  });

  it('adds --ffmpeg-location when provided', () => {
    const plan = buildYtDlpArgs(
      { jobId: 'j', inputUrl: 'https://example.com/v', outputName: 'c.mp4', quality: 'best' },
      { outputPath: OUTPUT, ffmpegLocation: 'C:\\tools\\ffmpeg' },
    );
    expect(plan.args).toEqual(expect.arrayContaining(['--ffmpeg-location', 'C:\\tools\\ffmpeg']));
  });

  it('rejects non-http URLs and output paths outside the helper directory', () => {
    expect(() =>
      buildYtDlpArgs({ jobId: 'j', inputUrl: 'file:///etc/passwd', outputName: 'c.mp4', quality: 'best' }, { outputPath: OUTPUT }),
    ).toThrow(/Unsupported input URL/);
    expect(() =>
      buildYtDlpArgs(
        { jobId: 'j', inputUrl: 'https://example.com/v', outputName: 'c.mp4', quality: 'best' },
        { outputPath: 'C:\\Windows\\System32\\evil.mp4' },
      ),
    ).toThrow(/helper-owned/);
  });
});
