import { describe, expect, test, vi } from 'vitest';
import { createExternalHub } from '../external-hub';

describe('external hub', () => {
  test('does not call disabled integrations', async () => {
    const aria2 = vi.fn();
    const webhook = vi.fn();
    const player = vi.fn();
    const hub = createExternalHub({
      aria2Enabled: false,
      webhookEnabled: false,
      aria2Client: { addUri: aria2 },
      webhookFetch: webhook,
      playerLauncher: { launch: player },
    });
    const result = await hub.dispatch({
      url: 'https://example.com/v.m3u8',
      filename: 'v.mp4',
    });
    expect(aria2).not.toHaveBeenCalled();
    expect(webhook).not.toHaveBeenCalled();
    expect(player).not.toHaveBeenCalled();
    expect(result.aria2Gid).toBeUndefined();
    expect(result.webhookOk).toBe(false);
  });

  test('calls Aria2 when enabled', async () => {
    const aria2 = vi.fn(async (_url: string) => 'gid-1');
    const hub = createExternalHub({
      aria2Enabled: true,
      webhookEnabled: false,
      aria2Client: { addUri: aria2 },
      webhookFetch: vi.fn(),
      playerLauncher: { launch: vi.fn() },
    });
    const result = await hub.dispatch({
      url: 'https://example.com/v.m3u8',
      filename: 'v.mp4',
      referer: 'https://example.com/',
    });
    expect(aria2).toHaveBeenCalledWith('https://example.com/v.m3u8', {
      referer: 'https://example.com/',
      headers: undefined,
      filename: 'v.mp4',
      allowSensitive: false,
    });
    expect(result.aria2Gid).toBe('gid-1');
  });

  test('webhook payload omits cookies and authorization by default', async () => {
    const webhook = vi.fn<typeof fetch>(async () => new Response('', { status: 200 }));
    const hub = createExternalHub({
      aria2Enabled: false,
      webhookEnabled: true,
      webhookUrl: 'https://hook.example/notify',
      aria2Client: { addUri: vi.fn() },
      webhookFetch: webhook,
      playerLauncher: { launch: vi.fn() },
    });
    await hub.dispatch({
      url: 'https://example.com/v.m3u8',
      filename: 'v.mp4',
      headers: { Referer: 'https://r/', Cookie: 'sek', Authorization: 'Bearer t' },
    });
    expect(webhook).toHaveBeenCalledTimes(1);
    const [url, init] = webhook.mock.calls[0];
    expect(url).toBe('https://hook.example/notify');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.url).toBe('https://example.com/v.m3u8');
    expect(body.filename).toBe('v.mp4');
    expect(body.headers).toEqual({ Referer: 'https://r/' });
  });

  test('webhook forwards sensitive headers only when advancedMode + consent', async () => {
    const webhook = vi.fn<typeof fetch>(async () => new Response('', { status: 200 }));
    const hub = createExternalHub({
      aria2Enabled: false,
      webhookEnabled: true,
      webhookUrl: 'https://hook.example/notify',
      aria2Client: { addUri: vi.fn() },
      webhookFetch: webhook,
      playerLauncher: { launch: vi.fn() },
    });
    await hub.dispatch({
      url: 'https://example.com/v.m3u8',
      headers: { Cookie: 'sek', Authorization: 'Bearer t' },
      advancedMode: true,
      includeAuthHeaders: true,
    });
    const body = JSON.parse(String((webhook.mock.calls[0][1] as RequestInit).body));
    expect(body.headers).toEqual({ Cookie: 'sek', Authorization: 'Bearer t' });
  });

  test('webhook disabled when URL is empty even if enabled', async () => {
    const webhook = vi.fn();
    const hub = createExternalHub({
      aria2Enabled: false,
      webhookEnabled: true,
      webhookUrl: '',
      aria2Client: { addUri: vi.fn() },
      webhookFetch: webhook,
      playerLauncher: { launch: vi.fn() },
    });
    const result = await hub.dispatch({ url: 'https://example.com/v.m3u8' });
    expect(webhook).not.toHaveBeenCalled();
    expect(result.webhookOk).toBe(false);
  });

  test('player launch goes through playerLauncher with selected profile', async () => {
    const launch = vi.fn(async (_input: unknown) => ({ ok: true }));
    const hub = createExternalHub({
      aria2Enabled: false,
      webhookEnabled: false,
      aria2Client: { addUri: vi.fn() },
      webhookFetch: vi.fn(),
      playerLauncher: { launch },
    });
    await hub.launchPlayer(
      { id: 'vlc', name: 'VLC', path: '/usr/bin/vlc' },
      { url: 'https://example.com/v', headers: { Referer: 'https://r/' } },
    );
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch.mock.calls[0][0]).toMatchObject({
      profile: { id: 'vlc' },
      url: 'https://example.com/v',
      headers: { Referer: 'https://r/' },
    });
  });
});
