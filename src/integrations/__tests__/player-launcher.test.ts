import { describe, expect, test, vi } from 'vitest';
import { createPlayerLauncher } from '../player-launcher';

describe('player launcher', () => {
  test('launch dispatches via native messaging handler', async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const launcher = createPlayerLauncher({ sendNativeMessage: send });
    await launcher.launch({
      profile: { id: 'vlc', name: 'VLC', path: '/usr/bin/vlc' },
      url: 'https://example.com/v.m3u8',
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({
      action: 'launch-player',
      playerPath: '/usr/bin/vlc',
      url: 'https://example.com/v.m3u8',
    });
  });

  test('refuses to launch when URL is missing or empty', async () => {
    const launcher = createPlayerLauncher({ sendNativeMessage: vi.fn() });
    await expect(
      launcher.launch({
        profile: { id: 'vlc', name: 'VLC', path: '/usr/bin/vlc' },
        url: '',
      }),
    ).rejects.toThrow(/url required/i);
  });

  test('refuses to launch when player path is empty', async () => {
    const launcher = createPlayerLauncher({ sendNativeMessage: vi.fn() });
    await expect(
      launcher.launch({
        profile: { id: 'mpv', name: 'mpv', path: '' },
        url: 'https://example.com/v',
      }),
    ).rejects.toThrow(/player path required/i);
  });

  test('does not forward sensitive headers unless allowed', async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const launcher = createPlayerLauncher({ sendNativeMessage: send });
    await launcher.launch({
      profile: { id: 'mpv', name: 'mpv', path: '/usr/bin/mpv' },
      url: 'https://example.com/x',
      headers: { Referer: 'https://r/', Cookie: 'sek', Authorization: 'Bearer t' },
    });
    const payload = send.mock.calls[0][0] as { headers?: Record<string, string> };
    expect(payload.headers).toEqual({ Referer: 'https://r/' });
  });
});
