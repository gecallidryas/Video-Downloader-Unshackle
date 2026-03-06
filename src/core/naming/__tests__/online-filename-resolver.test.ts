import { describe, expect, test, vi } from 'vitest';
import { resolveOnlineFilename } from '../online-filename-resolver';

describe('resolveOnlineFilename', () => {
  test('requires a user-initiated call before touching the network', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      resolveOnlineFilename({
        url: 'https://cdn.example.com/video',
        extension: 'mp4',
        userInitiated: false,
        fetchImpl,
      }),
    ).rejects.toThrow(/user initiated/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('uses content-disposition filename from a user-initiated HEAD request', async () => {
    const headers = new Headers({
      'content-disposition': 'attachment; filename="remote name.mp4"',
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', { status: 200, headers }),
    );

    await expect(
      resolveOnlineFilename({
        url: 'https://cdn.example.com/video',
        extension: 'mp4',
        userInitiated: true,
        fetchImpl,
      }),
    ).resolves.toBe('remote name.mp4');

    expect(fetchImpl).toHaveBeenCalledWith('https://cdn.example.com/video', {
      method: 'HEAD',
      redirect: 'follow',
      credentials: 'include',
    });
  });
});
