import { describe, expect, test } from 'vitest';
import { createHeaderContextStore } from '../header-context';

describe('createHeaderContextStore', () => {
  test('captures only safe request headers', () => {
    const store = createHeaderContextStore();

    const context = store.capture({
      requestId: 'req-1',
      url: 'https://cdn.example.com/master.m3u8',
      requestHeaders: [
        { name: 'Referer', value: 'https://example.com/watch' },
        { name: 'Origin', value: 'https://example.com' },
        { name: 'Cookie', value: 'sid=secret' },
        { name: 'Authorization', value: 'Bearer secret' },
        { name: 'User-Agent', value: 'Unit Test Browser' },
      ],
    });

    expect(context).toEqual({
      url: 'https://cdn.example.com/master.m3u8',
      requestId: 'req-1',
      headers: {
        referer: 'https://example.com/watch',
        origin: 'https://example.com',
      },
    });
    expect(store.getByUrl('https://cdn.example.com/master.m3u8')).toEqual(
      context,
    );
  });

  test('rejects cookie and authorization when captureCredentialHeaders is false (default)', () => {
    const store = createHeaderContextStore();

    const result = store.capture({
      requestId: 'req-cred-off',
      url: 'https://cdn.example.com/secret.m3u8',
      requestHeaders: [
        { name: 'Cookie', value: 'sid=secret' },
        { name: 'Authorization', value: 'Bearer token' },
      ],
    });

    expect(result).toBeUndefined();
  });

  test('captures cookie and authorization when captureCredentialHeaders is true', () => {
    const store = createHeaderContextStore({ captureCredentialHeaders: true });

    const context = store.capture({
      requestId: 'req-cred-on',
      url: 'https://cdn.example.com/protected.m3u8',
      requestHeaders: [
        { name: 'Cookie', value: 'sid=secret' },
        { name: 'Authorization', value: 'Bearer token' },
        { name: 'User-Agent', value: 'Unit Test Browser' },
      ],
    });

    expect(context).toEqual({
      url: 'https://cdn.example.com/protected.m3u8',
      requestId: 'req-cred-on',
      headers: {
        cookie: 'sid=secret',
        authorization: 'Bearer token',
      },
    });
    expect(
      store.getByUrl('https://cdn.example.com/protected.m3u8'),
    ).toEqual(context);
  });

  test('captures all four headers when captureCredentialHeaders is true', () => {
    const store = createHeaderContextStore({ captureCredentialHeaders: true });

    const context = store.capture({
      requestId: 'req-all',
      url: 'https://cdn.example.com/all-headers.m3u8',
      requestHeaders: [
        { name: 'Referer', value: 'https://example.com/watch' },
        { name: 'Origin', value: 'https://example.com' },
        { name: 'Cookie', value: 'sid=secret' },
        { name: 'Authorization', value: 'Bearer token' },
      ],
    });

    expect(context).toEqual({
      url: 'https://cdn.example.com/all-headers.m3u8',
      requestId: 'req-all',
      headers: {
        referer: 'https://example.com/watch',
        origin: 'https://example.com',
        cookie: 'sid=secret',
        authorization: 'Bearer token',
      },
    });
  });

  test('drops empty contexts and can remove request entries', () => {
    const store = createHeaderContextStore();

    expect(
      store.capture({
        requestId: 'req-2',
        url: 'https://cdn.example.com/video.mp4',
        requestHeaders: [{ name: 'Cookie', value: 'sid=secret' }],
      }),
    ).toBeUndefined();

    store.capture({
      requestId: 'req-3',
      url: 'https://cdn.example.com/video.mp4',
      requestHeaders: [{ name: 'Referer', value: 'https://example.com/watch' }],
    });
    store.deleteRequest('req-3');

    expect(store.getByRequestId('req-3')).toBeUndefined();
    expect(store.getByUrl('https://cdn.example.com/video.mp4')).toBeUndefined();
  });
});
