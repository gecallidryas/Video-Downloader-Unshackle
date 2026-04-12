import { describe, expect, test, vi } from 'vitest';
import { downloadDirectWithRanges, splitIntoRanges } from '../range-splitter';

describe('splitIntoRanges', () => {
  test('splits a 10MB file into 2MB chunks', () => {
    const chunks = splitIntoRanges(10 * 1024 * 1024, 2 * 1024 * 1024);

    expect(chunks).toHaveLength(5);
    expect(chunks[0]).toEqual({ start: 0, end: 2_097_151 });
    expect(chunks[4]).toEqual({ start: 8_388_608, end: 10_485_759 });
  });

  test('handles a file smaller than the chunk size', () => {
    expect(splitIntoRanges(1024, 2 * 1024 * 1024)).toEqual([
      { start: 0, end: 1023 },
    ]);
  });

  test('last chunk covers the remainder', () => {
    const chunks = splitIntoRanges(5 * 1024 * 1024, 2 * 1024 * 1024);

    expect(chunks).toHaveLength(3);
    expect(chunks[2]?.end).toBe(5 * 1024 * 1024 - 1);
  });
});

describe('downloadDirectWithRanges', () => {
  test('downloads range chunks and assembles them in order', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': '5',
          },
        });
      }

      const range = new Headers(init?.headers).get('Range');
      const bytes =
        range === 'bytes=0-1'
          ? new Uint8Array([1, 2])
          : range === 'bytes=2-3'
            ? new Uint8Array([3, 4])
            : new Uint8Array([5]);

      return new Response(bytes, { status: 206 });
    });

    await expect(
      downloadDirectWithRanges({
        url: 'https://cdn.example.com/video.mp4',
        chunkSizeBytes: 2,
        fetch: fetcher,
      }),
    ).resolves.toEqual(new Uint8Array([1, 2, 3, 4, 5]));

    expect(fetcher).toHaveBeenCalledWith(
      'https://cdn.example.com/video.mp4',
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  test('refuses with a clear error when accumulated size would exceed maxInMemoryBytes', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(10 * 1024 * 1024),
          },
        });
      }

      return new Response(new Uint8Array(2 * 1024 * 1024), { status: 206 });
    });

    await expect(
      downloadDirectWithRanges({
        url: 'https://cdn.example.com/video.mp4',
        chunkSizeBytes: 2 * 1024 * 1024,
        maxInMemoryBytes: 5 * 1024 * 1024,
        fetch: fetcher,
      }),
    ).rejects.toThrow(/exceeds.*memory.*ceiling|memory.*ceiling.*exceeded/i);
  });

  test('accepts a download whose total size is within maxInMemoryBytes', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': '5',
          },
        });
      }

      const range = new Headers(init?.headers).get('Range');
      const bytes =
        range === 'bytes=0-1'
          ? new Uint8Array([1, 2])
          : range === 'bytes=2-3'
            ? new Uint8Array([3, 4])
            : new Uint8Array([5]);

      return new Response(bytes, { status: 206 });
    });

    await expect(
      downloadDirectWithRanges({
        url: 'https://cdn.example.com/video.mp4',
        chunkSizeBytes: 2,
        maxInMemoryBytes: 100,
        fetch: fetcher,
      }),
    ).resolves.toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  test('rejects range responses that ignore the Range request', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': '5',
          },
        });
      }

      return new Response(new Uint8Array([1, 2, 3, 4, 5]), { status: 200 });
    });

    await expect(
      downloadDirectWithRanges({
        url: 'https://cdn.example.com/video.mp4',
        chunkSizeBytes: 2,
        fetch: fetcher,
      }),
    ).rejects.toMatchObject({ status: 200 });
  });
});
