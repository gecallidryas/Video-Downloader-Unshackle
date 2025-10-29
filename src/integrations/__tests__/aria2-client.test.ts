import { describe, expect, test, vi } from 'vitest';
import { createAria2Client } from '../aria2-client';

describe('aria2 client', () => {
  test('addUri posts JSON-RPC payload with url and headers', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: '1', jsonrpc: '2.0', result: 'gid-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createAria2Client({
      rpcUrl: 'http://localhost:6800/jsonrpc',
      secret: 'shh',
      fetchImpl: fetchMock,
    });

    const result = await client.addUri('https://example.com/video.mp4', {
      referer: 'https://example.com/',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      filename: 'clip.mp4',
    });

    expect(result).toBe('gid-123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:6800/jsonrpc');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.method).toBe('aria2.addUri');
    expect(body.params[0]).toBe('token:shh');
    expect(body.params[1]).toEqual(['https://example.com/video.mp4']);
    expect(body.params[2].referer).toBe('https://example.com/');
    expect(body.params[2].out).toBe('clip.mp4');
    expect(body.params[2].header).toContain('User-Agent: Mozilla/5.0');
  });

  test('omits secret token from params when not configured', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: '1', jsonrpc: '2.0', result: 'gid' })),
    );
    const client = createAria2Client({
      rpcUrl: 'http://localhost:6800/jsonrpc',
      secret: '',
      fetchImpl: fetchMock,
    });
    await client.addUri('https://example.com/x', {});
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.params[0]).toEqual(['https://example.com/x']);
  });

  test('throws when RPC returns error', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ id: '1', jsonrpc: '2.0', error: { code: 1, message: 'fail' } }),
      ),
    );
    const client = createAria2Client({
      rpcUrl: 'http://localhost:6800/jsonrpc',
      secret: '',
      fetchImpl: fetchMock,
    });
    await expect(client.addUri('https://example.com/x', {})).rejects.toThrow(/fail/);
  });

  test('does not include sensitive cookie or authorization unless allowSensitive true', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: '1', jsonrpc: '2.0', result: 'gid' })),
    );
    const client = createAria2Client({
      rpcUrl: 'http://localhost:6800/jsonrpc',
      secret: '',
      fetchImpl: fetchMock,
    });
    await client.addUri('https://example.com/x', {
      headers: { Cookie: 'sek=1', Authorization: 'Bearer tok', Referer: 'https://e/' },
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    const downloadOpts = body.params[body.params.length - 1] as { header?: string[] };
    const headersArr = downloadOpts.header ?? [];
    expect(headersArr.join('\n')).not.toMatch(/cookie/i);
    expect(headersArr.join('\n')).not.toMatch(/authorization/i);
  });

  test('allowSensitive forwards Cookie/Authorization', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: '1', jsonrpc: '2.0', result: 'gid' })),
    );
    const client = createAria2Client({
      rpcUrl: 'http://localhost:6800/jsonrpc',
      secret: '',
      fetchImpl: fetchMock,
    });
    await client.addUri('https://example.com/x', {
      headers: { Cookie: 'sek=1', Authorization: 'Bearer tok' },
      allowSensitive: true,
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    const downloadOpts = body.params[body.params.length - 1] as { header?: string[] };
    const headersArr = downloadOpts.header ?? [];
    expect(headersArr.join('\n')).toMatch(/Cookie: sek=1/);
    expect(headersArr.join('\n')).toMatch(/Authorization: Bearer tok/);
  });
});
