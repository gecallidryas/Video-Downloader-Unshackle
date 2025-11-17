import { describe, expect, test, vi } from 'vitest';
import type { DownloadJob, MediaCandidate } from '@/video_downloader_types_skeleton';
import * as segmentScheduler from '@/src/core/download/segment-scheduler';
import { deriveHlsAes128Iv } from '@/src/core/hls/decrypt-aes128-segment';
import { parseHlsManifest } from '@/src/core/hls/parse-hls-manifest';
import { runBrowserHlsExportJob } from '../browser-hls-runner';

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-hls-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'hls',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: 'playlist.mp4',
    manifestUrl: 'https://cdn.example.com/hls/master.m3u8',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function job(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: 'job-hls-1',
    candidateId: 'candidate-hls-1',
    tabId: 7,
    phase: 'queued',
    createdAt: 1,
    updatedAt: 1,
    selection: { mode: 'best' },
    progressPct: 0,
    bytesDownloaded: 0,
    ...overrides,
  };
}

async function encryptAesCbc(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(key),
    'AES-CBC',
    false,
    ['encrypt'],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: new Uint8Array(iv) },
    cryptoKey,
    new Uint8Array(plaintext),
  );

  return new Uint8Array(encrypted);
}

describe('browser HLS export runner', () => {
  test('fetches segment bytes with scheduler request headers and writes a raw TS download', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/media/prog.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="2@0"',
        '#EXTINF:4,',
        '#EXT-X-BYTERANGE:3@2',
        'segment.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });
    const fetchBytes = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('init.mp4')) {
        expect(init.headers).toEqual({ Range: 'bytes=0-1' });
        expect(init.signal).toBeInstanceOf(AbortSignal);
        return new Uint8Array([1, 2]);
      }

      expect(url).toBe('https://cdn.example.com/hls/media/segment.ts');
      expect(init.headers).toEqual({ Range: 'bytes=2-4' });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Uint8Array([3, 4, 5]);
    });
    const createObjectUrl = vi.fn().mockReturnValue('blob:raw-hls');
    const revokeObjectUrl = vi.fn();
    const download = vi.fn().mockResolvedValue(77);

    await expect(
      runBrowserHlsExportJob({
        candidate: candidate(),
        job: job({ selection: { mode: 'best', saveAs: true } }),
        manifest,
        fetchBytes,
        createObjectUrl,
        revokeObjectUrl,
        download,
      }),
    ).resolves.toMatchObject({
      fileName: 'playlist.ts',
      mimeType: 'video/mp2t',
      outputUrl: 'blob:raw-hls',
      downloadId: 77,
      sizeBytes: 5,
    });

    expect(download).toHaveBeenCalledWith({
      url: 'blob:raw-hls',
      filename: 'playlist.ts',
      saveAs: true,
    });
  });

  test('fetches AES-128 key bytes with credentials included', async () => {
    const key = new Uint8Array([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
      0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    ]);
    const iv = '0x101112131415161718191a1b1c1d1e1f';
    const clearBytes = new TextEncoder().encode('clear hls segment');
    const encryptedBytes = await encryptAesCbc(clearBytes, key, deriveHlsAes128Iv(iv, 0));
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
      content: [
        '#EXTM3U',
        `#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=${iv}`,
        '#EXTINF:4,',
        'encrypted.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });
    const fetchBytes = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('key.bin')) {
        expect(init.credentials).toBe('include');
        expect(init.cache).toBe('no-store');
        return key;
      }

      expect(url).toBe('https://cdn.example.com/hls/encrypted.ts');
      return encryptedBytes;
    });

    await runBrowserHlsExportJob({
      candidate: candidate({ protection: { kind: 'aes-128' } }),
      job: job(),
      manifest,
      fetchBytes,
      createObjectUrl: vi.fn().mockReturnValue('blob:encrypted-hls'),
      revokeObjectUrl: vi.fn(),
      download: vi.fn().mockResolvedValue(88),
    });

    expect(fetchBytes).toHaveBeenCalledWith(
      'https://cdn.example.com/hls/key.bin',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  test('passes scheduling and quality settings through the HLS job', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
      content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    });
    const schedulerSpy = vi.spyOn(segmentScheduler, 'scheduleSegments');

    await runBrowserHlsExportJob({
      candidate: candidate(),
      job: job(),
      manifest,
      fetchBytes: vi.fn().mockResolvedValue(new Uint8Array([1])),
      createObjectUrl: vi.fn().mockReturnValue('blob:raw-hls'),
      revokeObjectUrl: vi.fn(),
      download: vi.fn().mockResolvedValue(99),
      concurrency: 6,
      maxConcurrentPerHost: 2,
      segmentTimeoutMs: 12_000,
      qualityPolicy: 'lowest',
    });

    expect(schedulerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 6,
        maxConcurrentPerHost: 2,
        segmentTimeoutMs: 12_000,
      }),
    );
    schedulerSpy.mockRestore();
  });

  test('rejects protected non-AES HLS before fetching', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/protected.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://asset"',
        '#EXTINF:4,',
        'protected.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    });
    const fetchBytes = vi.fn();
    const download = vi.fn();

    await expect(
      runBrowserHlsExportJob({
        candidate: candidate({
          status: 'protected',
          protection: { kind: 'sample-aes', method: 'SAMPLE-AES' },
        }),
        job: job(),
        manifest,
        fetchBytes,
        download,
      }),
    ).rejects.toThrow('Protected HLS media cannot be exported by the browser runner.');

    expect(fetchBytes).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
});
