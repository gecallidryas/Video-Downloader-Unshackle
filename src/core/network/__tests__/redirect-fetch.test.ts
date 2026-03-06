import { describe, expect, test, vi } from 'vitest';
import { fetchFollowingRedirectsWithHeaders } from '../redirect-fetch';

describe('fetchFollowingRedirectsWithHeaders', () => {
  test('preserves safe headers while asking fetch to follow redirects', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
    const headers = {
      Referer: 'https://example.com/watch',
      Origin: 'https://example.com',
    };

    await fetchFollowingRedirectsWithHeaders('https://cdn.example.com/video.mp4', {
      headers,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://cdn.example.com/video.mp4', {
      redirect: 'follow',
      headers,
      credentials: 'include',
    });
  });
});
