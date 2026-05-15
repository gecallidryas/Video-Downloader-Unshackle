import { describe, expect, test } from 'vitest';
import { buildEngineHandoff } from '../header-context';
import type { HeaderContext } from '../header-context';

function ctx(headers: HeaderContext['headers']): HeaderContext {
  return {
    url: 'https://cdn.example.com/master.m3u8',
    requestId: 'r1',
    headers,
  };
}

describe('buildEngineHandoff — yt-dlp / browser-fetch header contract', () => {
  test('includes Referer and Origin by default', () => {
    const handoff = buildEngineHandoff(
      ctx({
        referer: 'https://site.example.com/watch',
        origin: 'https://site.example.com',
        cookie: 'sid=secret',
        authorization: 'Bearer token',
      }),
      {},
    );

    expect(handoff.url).toBe('https://cdn.example.com/master.m3u8');
    expect(handoff.headers).toEqual([
      { name: 'Referer', value: 'https://site.example.com/watch' },
      { name: 'Origin', value: 'https://site.example.com' },
    ]);
    expect(handoff.cookie).toBeUndefined();
  });

  test('excludes cookies/auth unless advancedMode AND captureCredentialHeaders', () => {
    const headers: HeaderContext['headers'] = {
      referer: 'https://site/watch',
      cookie: 'sid=secret',
      authorization: 'Bearer token',
    };

    expect(
      buildEngineHandoff(ctx(headers), {
        advancedMode: true,
        captureCredentialHeaders: false,
      }).cookie,
    ).toBeUndefined();

    expect(
      buildEngineHandoff(ctx(headers), {
        advancedMode: false,
        captureCredentialHeaders: true,
      }).cookie,
    ).toBeUndefined();
  });

  test('includes cookie + Authorization when policy fully enables credentials', () => {
    const handoff = buildEngineHandoff(
      ctx({
        referer: 'https://site/watch',
        cookie: 'sid=secret',
        authorization: 'Bearer token',
      }),
      { advancedMode: true, captureCredentialHeaders: true },
    );

    expect(handoff.cookie).toBe('sid=secret');
    expect(handoff.headers).toContainEqual({
      name: 'Authorization',
      value: 'Bearer token',
    });
    expect(handoff.headers).toContainEqual({
      name: 'Referer',
      value: 'https://site/watch',
    });
  });

  test('downloadFromLoggedInSites alone enables credentials without advancedMode', () => {
    const handoff = buildEngineHandoff(
      ctx({ cookie: 'sid=secret', authorization: 'Bearer token' }),
      { downloadFromLoggedInSites: true },
    );

    expect(handoff.cookie).toBe('sid=secret');
    expect(handoff.headers).toContainEqual({
      name: 'Authorization',
      value: 'Bearer token',
    });
  });
});
