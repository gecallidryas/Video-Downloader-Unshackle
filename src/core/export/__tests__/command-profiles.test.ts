import { describe, expect, test } from 'vitest';
import {
  BUILT_IN_PROFILES,
  getProfile,
  listProfileIds,
  renderProfileCommand,
} from '../command-profiles';

describe('command profiles', () => {
  test('lists all built-in profile ids', () => {
    const ids = listProfileIds();
    expect(ids).toEqual(
      expect.arrayContaining(['yt-dlp', 'ffmpeg', 'streamlink', 'hlsdl', 'n_m3u8dl-re']),
    );
  });

  test('each built-in profile defines required metadata', () => {
    for (const profile of BUILT_IN_PROFILES) {
      expect(profile.id).toBeTruthy();
      expect(profile.label).toBeTruthy();
      expect(profile.binary).toBeTruthy();
      expect(typeof profile.urlFlag).toBe('string');
      expect(typeof profile.outputFlag).toBe('string');
    }
  });

  test('getProfile returns null for unknown id', () => {
    expect(getProfile('does-not-exist')).toBeNull();
  });

  test('yt-dlp command quotes URL and uses --output flag', () => {
    const cmd = renderProfileCommand('yt-dlp', {
      url: 'https://example.com/video.m3u8',
      filename: 'clip.mp4',
    });
    expect(cmd.command).toContain('yt-dlp');
    expect(cmd.command).toContain('"https://example.com/video.m3u8"');
    expect(cmd.command).toContain('--output "clip.mp4"');
    expect(cmd.containsSensitiveData).toBe(false);
  });

  test('ffmpeg command uses -i input flag and -y overwrite', () => {
    const cmd = renderProfileCommand('ffmpeg', {
      url: 'https://example.com/video.m3u8',
      filename: 'clip.mp4',
    });
    expect(cmd.command).toContain('ffmpeg');
    expect(cmd.command).toContain('-i "https://example.com/video.m3u8"');
    expect(cmd.command).toContain('"clip.mp4"');
  });

  test('streamlink command places url then output', () => {
    const cmd = renderProfileCommand('streamlink', {
      url: 'https://example.com/live.m3u8',
      filename: 'live.ts',
    });
    expect(cmd.command).toContain('streamlink');
    expect(cmd.command).toContain('--output "live.ts"');
    expect(cmd.command).toContain('"https://example.com/live.m3u8"');
  });

  test('hlsdl and n_m3u8dl-re render with output flag', () => {
    const hlsdl = renderProfileCommand('hlsdl', {
      url: 'https://example.com/a.m3u8',
      filename: 'a.ts',
    });
    expect(hlsdl.command).toContain('hlsdl');
    expect(hlsdl.command).toContain('-o "a.ts"');

    const nm = renderProfileCommand('n_m3u8dl-re', {
      url: 'https://example.com/b.m3u8',
      filename: 'b.mp4',
    });
    expect(nm.command.toLowerCase()).toContain('m3u8dl-re');
    expect(nm.command).toContain('--save-name "b"');
  });

  test('default render excludes sensitive cookie/authorization headers', () => {
    const cmd = renderProfileCommand('yt-dlp', {
      url: 'https://example.com/video.m3u8',
      cookie: 'session=abc',
      authorization: 'Bearer xyz',
    });
    expect(cmd.command).not.toContain('Cookie');
    expect(cmd.command).not.toContain('Authorization');
    expect(cmd.containsSensitiveData).toBe(false);
  });

  test('includes auth headers only when includeAuthHeaders true and adds warning', () => {
    const cmd = renderProfileCommand('yt-dlp', {
      url: 'https://example.com/video.m3u8',
      cookie: 'session=abc',
      authorization: 'Bearer xyz',
      includeAuthHeaders: true,
    });
    expect(cmd.command).toContain('Cookie: session=abc');
    expect(cmd.command).toContain('Authorization: Bearer xyz');
    expect(cmd.command).toContain('WARNING');
    expect(cmd.containsSensitiveData).toBe(true);
  });

  test('includes safe referer and user-agent flags', () => {
    const cmd = renderProfileCommand('yt-dlp', {
      url: 'https://example.com/video.m3u8',
      referer: 'https://example.com/',
      userAgent: 'Mozilla/5.0',
    });
    expect(cmd.command).toContain('--referer "https://example.com/"');
    expect(cmd.command).toContain('--user-agent "Mozilla/5.0"');
  });

  test('custom template profile renders from string template', () => {
    const cmd = renderProfileCommand(
      'custom',
      { url: 'https://example.com/v', filename: 'out.mp4' },
      { customTemplate: 'mytool {url} > {filename}' },
    );
    expect(cmd.command).toBe('mytool https://example.com/v > out.mp4');
  });

  test('custom template ignores sensitive variables without advancedMode', () => {
    const cmd = renderProfileCommand(
      'custom',
      { url: 'https://example.com/v', cookie: 'sek', authorization: 'tok' },
      { customTemplate: 'tool {url} {cookie} {authorization}' },
    );
    expect(cmd.command).not.toContain('sek');
    expect(cmd.command).not.toContain('tok');
  });

  test('custom template expands sensitive variables when advancedMode + includeAuthHeaders', () => {
    const cmd = renderProfileCommand(
      'custom',
      {
        url: 'https://example.com/v',
        cookie: 'sek',
        authorization: 'tok',
        includeAuthHeaders: true,
      },
      { customTemplate: 'tool {url} {cookie} {authorization}', advancedMode: true },
    );
    expect(cmd.command).toContain('sek');
    expect(cmd.command).toContain('tok');
    expect(cmd.containsSensitiveData).toBe(true);
  });

  test('renderProfileCommand throws for unknown profile', () => {
    expect(() =>
      renderProfileCommand('made-up', { url: 'https://example.com/' }),
    ).toThrow(/unknown profile/i);
  });
});
