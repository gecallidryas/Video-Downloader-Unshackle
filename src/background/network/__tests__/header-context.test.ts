import { describe, expect, test, vi, afterEach, beforeEach } from 'vitest';
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

  test('drops empty contexts and removes the requestId entry', () => {
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
  });

  test('deleteRequest removes only the requestId entry; byUrl is retained within TTL', () => {
    const store = createHeaderContextStore({ urlRetentionMs: 5_000 });

    store.capture({
      requestId: 'req-ttl',
      url: 'https://cdn.example.com/retain.m3u8',
      requestHeaders: [{ name: 'Referer', value: 'https://example.com/watch' }],
    });

    store.deleteRequest('req-ttl');

    expect(store.getByRequestId('req-ttl')).toBeUndefined();
    expect(store.getByUrl('https://cdn.example.com/retain.m3u8')).toEqual({
      url: 'https://cdn.example.com/retain.m3u8',
      requestId: 'req-ttl',
      headers: { referer: 'https://example.com/watch' },
    });
  });
});

describe('createHeaderContextStore — URL TTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('getByUrl returns headers within TTL after deleteRequest', () => {
    const store = createHeaderContextStore({ urlRetentionMs: 10_000 });

    store.capture({
      requestId: 'r1',
      url: 'https://cdn.example.com/video.m3u8',
      requestHeaders: [{ name: 'Referer', value: 'https://example.com' }],
    });

    store.deleteRequest('r1');

    vi.advanceTimersByTime(9_999);

    expect(store.getByUrl('https://cdn.example.com/video.m3u8')).not.toBeUndefined();
    expect(store.getByUrl('https://cdn.example.com/video.m3u8')?.headers.referer).toBe(
      'https://example.com',
    );
  });

  test('getByUrl returns undefined after TTL expires', () => {
    const store = createHeaderContextStore({ urlRetentionMs: 10_000 });

    store.capture({
      requestId: 'r2',
      url: 'https://cdn.example.com/expired.m3u8',
      requestHeaders: [{ name: 'Referer', value: 'https://example.com' }],
    });

    store.deleteRequest('r2');

    vi.advanceTimersByTime(10_001);

    expect(store.getByUrl('https://cdn.example.com/expired.m3u8')).toBeUndefined();
  });

  test('updateOptions can change urlRetentionMs at runtime', () => {
    const store = createHeaderContextStore({ urlRetentionMs: 60_000 });

    store.capture({
      requestId: 'r3',
      url: 'https://cdn.example.com/dynamic.m3u8',
      requestHeaders: [{ name: 'Referer', value: 'https://example.com' }],
    });

    store.deleteRequest('r3');
    store.updateOptions({ urlRetentionMs: 1_000 });

    vi.advanceTimersByTime(1_500);

    expect(store.getByUrl('https://cdn.example.com/dynamic.m3u8')).toBeUndefined();
  });
});
