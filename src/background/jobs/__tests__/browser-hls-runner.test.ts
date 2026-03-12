import { describe, expect, test, vi } from 'vitest';
import type { DownloadJob, MediaCandidate } from '@/video_downloader_types_skeleton';
import type {
  BrowserHlsExportDiagnostic,
  BrowserHlsExportResponse,
  OffscreenCommand,
} from '@/src/shared/contracts/offscreen';
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

const TS_PACKET_SIZE = 188;

function tsPacket(pid: number, payload: number[]): Uint8Array {
  const bytes = new Uint8Array(TS_PACKET_SIZE);

  bytes.fill(0xff);
  bytes[0] = 0x47;
  bytes[1] = 0x40 | ((pid >> 8) & 0x1f);
  bytes[2] = pid & 0xff;
  bytes[3] = 0x10;
  bytes[4] = 0x00;
  bytes.set(payload, 5);

  return bytes;
}

function muxCompatibleTsBytes(): Uint8Array {
  const pmtPid = 0x0100;
  const pat = tsPacket(0x0000, [
    0x00, 0xb0, 0x0d,
    0x00, 0x01,
    0xc1,
    0x00,
    0x00,
    0x00, 0x01,
    0xe0 | ((pmtPid >> 8) & 0x1f), pmtPid & 0xff,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const pmt = tsPacket(pmtPid, [
    0x02, 0xb0, 0x17,
    0x00, 0x01,
    0xc1,
    0x00,
    0x00,
    0xe1, 0x00,
    0xf0, 0x00,
    0x1b, 0xe1, 0x00, 0xf0, 0x00,
    0x0f, 0xe1, 0x01, 0xf0, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const bytes = new Uint8Array(TS_PACKET_SIZE * 2);

  bytes.set(pat, 0);
  bytes.set(pmt, TS_PACKET_SIZE);

  return bytes;
}

describe('browser HLS export runner', () => {
  test('refuses fMP4 HLS in the browser path instead of writing raw segment artifacts', async () => {
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
    const download = vi.fn().mockResolvedValue(77);

    await expect(
      runBrowserHlsExportJob({
        candidate: candidate(),
        job: job({ selection: { mode: 'best', saveAs: true } }),
        manifest,
        fetchBytes,
        download,
      }),
    ).rejects.toThrow('cannot assemble fMP4 into a playable MP4');

    expect(fetchBytes).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  test('refuses HLS browser exports when mux.js is disabled instead of writing TS directly to disk', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
      content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    });
    const writeFile = vi.fn(async () => undefined);
    const download = vi.fn();

    await expect(
      runBrowserHlsExportJob({
        candidate: candidate(),
        job: job(),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(new Uint8Array([0x47, 1, 2])),
        writeFile,
        download,
        browserTransmuxWithMuxJs: false,
      }),
    ).rejects.toThrow('mux.js browser transmux is disabled');

    expect(writeFile).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  test('transmuxes TS segments to MP4 when mux.js browser fallback is enabled', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
      content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    });
    const createObjectUrl = vi.fn().mockReturnValue('blob:mp4-hls');
    const download = vi.fn().mockResolvedValue(78);

    await expect(
      runBrowserHlsExportJob({
        candidate: candidate({ codecs: ['avc1.640028', 'mp4a.40.2'] }),
        job: job(),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(muxCompatibleTsBytes()),
        createObjectUrl,
        download,
        browserTransmuxWithMuxJs: true,
        browserTransmuxMaxBytes: 10_000,
        transmuxTsToMp4: vi.fn().mockResolvedValue({
          bytes: new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
          mimeType: 'video/mp4',
        }),
      }),
    ).resolves.toMatchObject({
      fileName: 'playlist.mp4',
      mimeType: 'video/mp4',
      outputUrl: 'blob:mp4-hls',
      downloadId: 78,
      sizeBytes: 8,
      notes: ['Browser transmuxed MPEG-TS HLS segments to MP4 with mux.js.'],
    });

    expect(download).toHaveBeenCalledWith({
      url: 'blob:mp4-hls',
      filename: 'playlist.mp4',
      saveAs: false,
    });
  });

  test('streams mux.js MP4 browser fallback through the offscreen export host', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
      content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    });
    const offscreenExport = vi.fn(async (
      command: OffscreenCommand,
    ): Promise<BrowserHlsExportResponse> => {
      if (command.type === 'FINALIZE_BROWSER_HLS_EXPORT') {
        return {
          ok: true,
          command: command.type,
          bytesWritten: 8,
          output: {
            fileName: 'playlist.mp4',
            mimeType: 'video/mp4',
            outputUrl: 'blob:offscreen-mp4',
            downloadId: 99,
            sizeBytes: 8,
          },
        };
      }

      return {
        ok: true,
        command: command.type,
        bytesWritten: command.type === 'APPEND_BROWSER_HLS_SEGMENT' ? 4 : 0,
      };
    });

    await expect(
      runBrowserHlsExportJob({
        candidate: candidate({ codecs: ['avc1.640028', 'mp4a.40.2'] }),
        job: job(),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(muxCompatibleTsBytes()),
        browserTransmuxWithMuxJs: true,
        browserTransmuxMaxBytes: 10_000,
        streamingCapabilities: {
          fileSystemAccess: false,
          opfs: false,
          writableStream: true,
          persistedOutputDirectory: false,
        },
        offscreenExport,
      }),
    ).resolves.toMatchObject({
      fileName: 'playlist.mp4',
      mimeType: 'video/mp4',
      outputUrl: 'blob:offscreen-mp4',
      downloadId: 99,
      sizeBytes: 8,
      notes: [
        'MPEG-TS HLS with mux.js-compatible codec hints is routed through offscreen MP4 transmux.',
      ],
    });

    expect(offscreenExport.mock.calls.map(([command]) => command.type)).toEqual([
      'START_BROWSER_HLS_EXPORT',
      'APPEND_BROWSER_HLS_SEGMENT',
      'FINALIZE_BROWSER_HLS_EXPORT',
    ]);
    expect(offscreenExport.mock.calls[0]?.[0]).toMatchObject({
      payload: {
        route: 'hls-ts-streaming-mp4',
        outputName: 'playlist.mp4',
        mimeType: 'video/mp4',
        sinkKind: 'blob-memory',
      },
    });
  });

  test('refuses TS-looking playlists when the segment byte probe is ISO BMFF', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
      content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    });
    const offscreenExport = vi.fn();

    await expect(
      runBrowserHlsExportJob({
        candidate: candidate({ codecs: ['avc1.640028', 'mp4a.40.2'] }),
        job: job(),
        manifest,
        fetchBytes: vi.fn()
          .mockResolvedValueOnce(new Uint8Array([
            0x00, 0x00, 0x00, 0x18,
            0x66, 0x74, 0x79, 0x70,
          ]))
          .mockResolvedValue(new Uint8Array([1, 2, 3])),
        browserTransmuxWithMuxJs: true,
        browserTransmuxMaxBytes: 10_000,
        streamingCapabilities: {
          fileSystemAccess: false,
          opfs: false,
          writableStream: true,
          persistedOutputDirectory: false,
        },
        offscreenExport,
      }),
    ).rejects.toThrow('Browser-only HLS export cannot assemble fMP4 into a playable MP4');

    expect(offscreenExport).not.toHaveBeenCalled();
  });

  test('refuses unsafe codec hints instead of saving raw HLS segment output', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
      content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    });
    const offscreenExport = vi.fn();

    await expect(
      runBrowserHlsExportJob({
        candidate: candidate(),
        job: job(),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(muxCompatibleTsBytes()),
        browserTransmuxWithMuxJs: true,
        browserTransmuxMaxBytes: 10_000,
        streamingCapabilities: {
          fileSystemAccess: false,
          opfs: true,
          writableStream: true,
          persistedOutputDirectory: false,
        },
        offscreenExport,
      }),
    ).rejects.toThrow('native FFmpeg is required for a playable MP4');

    expect(offscreenExport).not.toHaveBeenCalled();
  });

  test('keeps selected master variant codec hints when routing offscreen export', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/master.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=900000,CODECS="avc1.640028,mp4a.40.2"',
        'media/prog.m3u8',
      ].join('\n'),
    });
    const fetchText = vi.fn().mockResolvedValue(
      ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    );
    const offscreenExport = vi.fn(async (
      command: OffscreenCommand,
    ): Promise<BrowserHlsExportResponse> => {
      if (command.type === 'FINALIZE_BROWSER_HLS_EXPORT') {
        return {
          ok: true,
          command: command.type,
          output: {
            fileName: 'playlist.mp4',
            mimeType: 'video/mp4',
            outputUrl: 'blob:offscreen-mp4',
            downloadId: 100,
          },
        };
      }

      return { ok: true, command: command.type };
    });

    await runBrowserHlsExportJob({
      candidate: candidate(),
      job: job(),
      manifest,
      fetchText,
      fetchBytes: vi.fn().mockResolvedValue(muxCompatibleTsBytes()),
      browserTransmuxWithMuxJs: true,
      browserTransmuxMaxBytes: 10_000,
      streamingCapabilities: {
        fileSystemAccess: false,
        opfs: false,
        writableStream: true,
        persistedOutputDirectory: false,
      },
      offscreenExport,
    });

    expect(offscreenExport.mock.calls[0]?.[0]).toMatchObject({
      payload: {
        route: 'hls-ts-streaming-mp4',
      },
    });
  });

  test('starts the browser download in background when offscreen returns a blob URL', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
      content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    });
    const download = vi.fn().mockResolvedValue(101);
    const offscreenExport = vi.fn(async (
      command: OffscreenCommand,
    ): Promise<BrowserHlsExportResponse> => {
      if (command.type === 'FINALIZE_BROWSER_HLS_EXPORT') {
        return {
          ok: true,
          command: command.type,
          output: {
            fileName: 'playlist.mp4',
            mimeType: 'video/mp4',
            outputUrl: 'blob:offscreen-mp4',
            sizeBytes: 8,
          },
        };
      }

      return { ok: true, command: command.type };
    });

    await expect(
      runBrowserHlsExportJob({
        candidate: candidate({ codecs: ['avc1.640028', 'mp4a.40.2'] }),
        job: job({ selection: { mode: 'best', saveAs: true } }),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(muxCompatibleTsBytes()),
        browserTransmuxWithMuxJs: true,
        browserTransmuxMaxBytes: 10_000,
        streamingCapabilities: {
          fileSystemAccess: false,
          opfs: false,
          writableStream: true,
          persistedOutputDirectory: false,
        },
        offscreenExport,
        download,
      }),
    ).resolves.toMatchObject({
      downloadId: 101,
    });

    expect(download).toHaveBeenCalledWith({
      url: 'blob:offscreen-mp4',
      filename: 'playlist.mp4',
      saveAs: true,
    });
  });

  test('surfaces offscreen mux diagnostics in browser HLS output notes', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
      content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    });
    const diagnostic: BrowserHlsExportDiagnostic = {
      kind: 'mux-failure',
      route: 'hls-ts-streaming-mp4',
      sinkKind: 'blob-memory',
      outputName: 'playlist.mp4',
      mimeType: 'video/mp4',
      rawFallbackAllowed: false,
      phase: 'append',
      message: 'mux.js browser transmux requires MPEG-TS segments.',
      muxErrorCode: 'UNSUPPORTED_SEGMENT_FORMAT',
      segmentIndex: 0,
      segmentUrl: 'https://cdn.example.com/hls/segment.ts',
      segmentBytes: 20,
      firstBytesHex: '6e 6f 74 20 74 73',
      hasTsSyncByteAt0: false,
    };
    const offscreenExport = vi.fn(async (
      command: OffscreenCommand,
    ): Promise<BrowserHlsExportResponse> => {
      if (command.type === 'APPEND_BROWSER_HLS_SEGMENT') {
        return {
          ok: true,
          command: command.type,
          bytesWritten: 0,
          diagnostics: [diagnostic],
        };
      }
      if (command.type === 'FINALIZE_BROWSER_HLS_EXPORT') {
        return {
          ok: false,
          command: command.type,
          bytesWritten: 20,
          diagnostics: [diagnostic],
          error: 'mux.js failed; native FFmpeg is required for playable MP4 output.',
        };
      }

      return {
        ok: true,
        command: command.type,
        bytesWritten: 0,
      };
    });

    await expect(
      runBrowserHlsExportJob({
        candidate: candidate({ codecs: ['avc1.640028', 'mp4a.40.2'] }),
        job: job(),
        manifest,
        fetchBytes: vi.fn()
          .mockResolvedValueOnce(muxCompatibleTsBytes())
          .mockResolvedValue(new TextEncoder().encode('not ts segment bytes')),
        browserTransmuxWithMuxJs: true,
        browserTransmuxMaxBytes: 10_000,
        streamingCapabilities: {
          fileSystemAccess: false,
          opfs: false,
          writableStream: true,
          persistedOutputDirectory: false,
        },
        offscreenExport,
      }),
    ).rejects.toThrow('native FFmpeg is required for playable MP4 output');
  });

  test('reports post-fetch phases while transmuxing and exporting browser HLS output', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
      content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    });
    const phases: string[] = [];

    await runBrowserHlsExportJob({
      candidate: candidate({ codecs: ['avc1.640028', 'mp4a.40.2'] }),
      job: job(),
      manifest,
      fetchBytes: vi.fn().mockResolvedValue(muxCompatibleTsBytes()),
      createObjectUrl: vi.fn().mockReturnValue('blob:mp4-hls'),
      download: vi.fn().mockResolvedValue(78),
      browserTransmuxWithMuxJs: true,
      browserTransmuxMaxBytes: 10_000,
      transmuxTsToMp4: vi.fn().mockResolvedValue({
        bytes: new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
        mimeType: 'video/mp4',
      }),
      onExportPhase: (phase) => phases.push(phase),
    });

    expect(phases).toEqual(['transmuxing', 'exporting']);
  });

  test('fails large browser-only HLS exports instead of building an unsafe raw blob', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
      content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    });
    const download = vi.fn();

    await expect(
      runBrowserHlsExportJob({
        candidate: candidate({
          codecs: ['avc1.640028', 'mp4a.40.2'],
          sizeEstimateBytes: 20_000,
        }),
        job: job(),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(muxCompatibleTsBytes()),
        createObjectUrl: vi.fn().mockReturnValue('blob:mp4-hls'),
        download,
        browserTransmuxWithMuxJs: true,
        browserTransmuxMaxBytes: 3,
      }),
    ).rejects.toThrow('Estimated HLS output exceeds the safe browser memory ceiling');

    expect(download).not.toHaveBeenCalled();
  });

  test('fails without saving raw TS when mux.js transmux fails', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/prog.m3u8',
      content: ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    });
    const download = vi.fn();

    await expect(
      runBrowserHlsExportJob({
        candidate: candidate({ codecs: ['avc1.640028', 'mp4a.40.2'] }),
        job: job(),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(muxCompatibleTsBytes()),
        createObjectUrl: vi.fn().mockReturnValue('blob:raw-hls'),
        download,
        browserTransmuxWithMuxJs: true,
        browserTransmuxMaxBytes: 10_000,
        transmuxTsToMp4: vi.fn().mockRejectedValue(new Error('unsupported stream')),
      }),
    ).rejects.toThrow('Browser HLS transmux failed: unsupported stream');

    expect(download).not.toHaveBeenCalled();
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
      candidate: candidate({
        codecs: ['avc1.640028', 'mp4a.40.2'],
        protection: { kind: 'aes-128' },
      }),
      job: job(),
      manifest,
      fetchBytes,
      createObjectUrl: vi.fn().mockReturnValue('blob:encrypted-hls'),
      revokeObjectUrl: vi.fn(),
      download: vi.fn().mockResolvedValue(88),
      browserTransmuxWithMuxJs: true,
      transmuxTsToMp4: vi.fn().mockResolvedValue({
        bytes: new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
        mimeType: 'video/mp4',
      }),
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
      candidate: candidate({ codecs: ['avc1.640028', 'mp4a.40.2'] }),
      job: job(),
      manifest,
      fetchBytes: vi.fn().mockResolvedValue(muxCompatibleTsBytes()),
      createObjectUrl: vi.fn().mockReturnValue('blob:mp4-hls'),
      revokeObjectUrl: vi.fn(),
      download: vi.fn().mockResolvedValue(99),
      browserTransmuxWithMuxJs: true,
      transmuxTsToMp4: vi.fn().mockResolvedValue({
        bytes: new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
        mimeType: 'video/mp4',
      }),
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

  test('fetches the selected media playlist when given an HLS master playlist', async () => {
    const manifest = parseHlsManifest({
      manifestUrl: 'https://cdn.example.com/hls/master.m3u8',
      content: [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=1280x720,CODECS="avc1.640028,mp4a.40.2"',
        'media/720p.m3u8',
      ].join('\n'),
    });
    const fetchText = vi.fn().mockResolvedValue(
      ['#EXTM3U', '#EXTINF:4,', 'segment.ts', '#EXT-X-ENDLIST'].join('\n'),
    );
    const fetchBytes = vi.fn().mockResolvedValue(muxCompatibleTsBytes());

    await runBrowserHlsExportJob({
      candidate: candidate(),
      job: job(),
      manifest,
      fetchText,
      fetchBytes,
      createObjectUrl: vi.fn().mockReturnValue('blob:master-hls'),
      revokeObjectUrl: vi.fn(),
      download: vi.fn().mockResolvedValue(100),
      browserTransmuxWithMuxJs: true,
      transmuxTsToMp4: vi.fn().mockResolvedValue({
        bytes: new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
        mimeType: 'video/mp4',
      }),
    });

    expect(fetchText).toHaveBeenCalledWith(
      'https://cdn.example.com/hls/media/720p.m3u8',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
      }),
    );
    expect(fetchBytes).toHaveBeenCalledWith(
      'https://cdn.example.com/hls/media/segment.ts',
      expect.any(Object),
    );
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
