import { describe, expect, test, vi } from 'vitest';
import type { DownloadJob, MediaCandidate } from '@/video_downloader_types_skeleton';
import { createJobStore } from '../job-store';
import {
  mapYtDlpQuality,
  parseYtDlpCustomArgs,
  runNativeExportJob,
  shouldRouteToYtDlp,
} from '../native-export-runner';
import type { NativeFfmpegClient } from '@/src/native/native-ffmpeg-client';
import { createInMemorySubtitleStore } from '@/src/core/storage/subtitle-store';

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function stubReadFullOutput(bytes: Uint8Array): (input: { outputPath: string; mimeType: string }) => Promise<Blob> {
  return async ({ mimeType }) => {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Blob([buffer], { type: mimeType });
  };
}

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: 'Clear video',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    mimeType: 'video/mp4',
    durationSec: 10,
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
    id: 'job-1',
    candidateId: 'candidate-1',
    tabId: 7,
    phase: 'queued',
    createdAt: 1,
    updatedAt: 1,
    selection: { mode: 'best', trim: { startSec: 1, endSec: 3 } },
    progressPct: 0,
    bytesDownloaded: 0,
    ...overrides,
  };
}

function nativeClient(): NativeFfmpegClient {
  return {
    ping: vi.fn(),
    exportMedia: vi.fn().mockResolvedValue({
      jobId: 'job-1',
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\clip.mp4',
      sizeBytes: 1200,
      mimeType: 'video/mp4',
    }),
    exportYtDlp: vi.fn().mockResolvedValue({
      jobId: 'job-1',
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\page.mp4',
      sizeBytes: 2400,
      mimeType: 'video/mp4',
    }),
    extractThumbnail: vi.fn(),
    extractPreviewClip: vi.fn(),
    cancelJob: vi.fn(),
    cleanupJob: vi.fn(),
  } as unknown as NativeFfmpegClient;
}

describe('runNativeExportJob', () => {
  test('maps direct trimmed media to native export payload, reads bytes back, and delivers via downloads', async () => {
    const client = nativeClient();
    const jobStore = createJobStore(() => 100);
    const queued = jobStore.create(candidate(), { mode: 'best', trim: { startSec: 1, endSec: 3 }, outputKind: 'mp4' });
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const deliverOutput = vi.fn().mockResolvedValue(42);

    const output = await runNativeExportJob({
      candidate: candidate(),
      job: queued,
      nativeClient: client,
      jobStore,
      readFullOutput: stubReadFullOutput(bytes),
      deliverOutput,
    });

    expect(client.exportMedia).toHaveBeenCalledWith(
      {
        jobId: queued.id,
        inputUrl: 'https://cdn.example.com/video.mp4',
        protocol: 'direct',
        outputName: 'Clear video.mp4',
        outputKind: 'mp4',
        trim: { startSec: 1, endSec: 3 },
      },
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
    expect(deliverOutput).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'clip.mp4', mimeType: 'video/mp4' }),
    );
    const deliveredBlob: Blob = deliverOutput.mock.calls[0][0].blob;
    expect(await blobBytes(deliveredBlob)).toEqual(bytes);
    expect(output).toEqual({
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
      outputUrl: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\clip.mp4',
      downloadId: 42,
      sizeBytes: 1200,
    });
  });

  test('threads gated handoff headers into the export payload when provided', async () => {
    const client = nativeClient();
    const jobStore = createJobStore(() => 100);
    const queued = jobStore.create(candidate(), { mode: 'best', outputKind: 'mp4' });

    await runNativeExportJob({
      candidate: candidate(),
      job: queued,
      nativeClient: client,
      jobStore,
      headers: { Cookie: 'session=abc', Referer: 'https://example.com/watch' },
      readFullOutput: stubReadFullOutput(new Uint8Array([1])),
      deliverOutput: vi.fn().mockResolvedValue(1),
    });

    expect(client.exportMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Cookie: 'session=abc', Referer: 'https://example.com/watch' },
      }),
      expect.anything(),
    );
  });

  test('omits the headers key from the export payload when none are provided', async () => {
    const client = nativeClient();
    const jobStore = createJobStore(() => 100);
    const queued = jobStore.create(candidate(), { mode: 'best', outputKind: 'mp4' });

    await runNativeExportJob({
      candidate: candidate(),
      job: queued,
      nativeClient: client,
      jobStore,
      readFullOutput: stubReadFullOutput(new Uint8Array([1])),
      deliverOutput: vi.fn().mockResolvedValue(1),
    });

    const payload = vi.mocked(client.exportMedia).mock.calls[0][0];
    expect(payload).not.toHaveProperty('headers');
  });

  test('forwards native progress events to the job store', async () => {
    const client = nativeClient();
    vi.mocked(client.exportMedia).mockImplementationOnce(async (_payload, options) => {
      options?.onProgress?.({ jobId: 'job-1', progressPct: 40, phase: 'transmuxing' });
      return {
        jobId: 'job-1',
        outputPath: 'C:\\outputs\\clip.mp4',
        sizeBytes: 10,
        mimeType: 'video/mp4',
      };
    });
    const jobStore = createJobStore(() => 100);
    const queued = jobStore.create(candidate(), { mode: 'best', outputKind: 'mp4' });

    await runNativeExportJob({
      candidate: candidate(),
      job: queued,
      nativeClient: client,
      jobStore,
      readFullOutput: stubReadFullOutput(new Uint8Array([1])),
      deliverOutput: vi.fn().mockResolvedValue(1),
    });

    expect(jobStore.get(queued.id)).toMatchObject({ phase: 'exporting', progressPct: 90 });
  });

  test('maps HLS and DASH candidates to manifest URL native exports', async () => {
    const client = nativeClient();

    const readFullOutput = stubReadFullOutput(new Uint8Array([1]));
    const deliverOutput = vi.fn().mockResolvedValue(1);
    await runNativeExportJob({
      candidate: candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job: job({ id: 'job-hls', selection: { mode: 'best', outputKind: 'webm' } }),
      nativeClient: client,
      readFullOutput,
      deliverOutput,
    });
    await runNativeExportJob({
      candidate: candidate({ protocol: 'dash', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/manifest.mpd' }),
      job: job({ id: 'job-dash', selection: { mode: 'best', outputKind: 'audio-only' } }),
      nativeClient: client,
      readFullOutput,
      deliverOutput,
    });

    expect(client.exportMedia).toHaveBeenNthCalledWith(1, expect.objectContaining({
      jobId: 'job-hls',
      inputUrl: 'https://cdn.example.com/master.m3u8',
      protocol: 'hls',
      outputKind: 'webm',
    }), expect.anything());
    expect(client.exportMedia).toHaveBeenNthCalledWith(2, expect.objectContaining({
      jobId: 'job-dash',
      inputUrl: 'https://cdn.example.com/manifest.mpd',
      protocol: 'dash',
      outputKind: 'audio-only',
    }), expect.anything());
  });

  test('routes page/site candidates to the yt-dlp engine using the page URL', async () => {
    const client = nativeClient();
    const jobStore = createJobStore(() => 100);
    const siteCandidate = candidate({
      id: 'candidate-page',
      protocol: 'unknown',
      sourceUrl: undefined,
      manifestUrl: undefined,
      pageUrl: 'https://example.com/watch?v=abc',
      displayName: 'Site video',
    });
    const queued = jobStore.create(siteCandidate, { mode: 'best', outputKind: 'mp4' });
    vi.mocked(client.exportYtDlp).mockImplementationOnce(async (_payload, options) => {
      options?.onProgress?.({ jobId: queued.id, progressPct: 55, phase: 'fetching' });
      return {
        jobId: queued.id,
        outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\page.mp4',
        sizeBytes: 2400,
        mimeType: 'video/mp4',
      };
    });
    const deliverOutput = vi.fn().mockResolvedValue(7);

    const output = await runNativeExportJob({
      candidate: siteCandidate,
      job: queued,
      nativeClient: client,
      jobStore,
      headers: { Cookie: 'session=abc' },
      readFullOutput: stubReadFullOutput(new Uint8Array([9, 9, 9])),
      deliverOutput,
    });

    expect(client.exportMedia).not.toHaveBeenCalled();
    expect(client.exportYtDlp).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: queued.id,
        inputUrl: 'https://example.com/watch?v=abc',
        quality: 'best-mp4',
        headers: { Cookie: 'session=abc' },
      }),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
    expect(jobStore.get(queued.id)).toMatchObject({ phase: 'exporting', progressPct: 90 });
    expect(deliverOutput).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'page.mp4' }));
    expect(output).toMatchObject({ fileName: 'page.mp4', downloadId: 7, sizeBytes: 2400 });
  });

  test('delivers yt-dlp sidecar subtitles and requests write+all when sidecar chosen', async () => {
    const client = nativeClient();
    const jobStore = createJobStore(() => 100);
    const siteCandidate = candidate({
      id: 'candidate-subs',
      protocol: 'unknown',
      sourceUrl: undefined,
      manifestUrl: undefined,
      pageUrl: 'https://example.com/watch?v=subs',
      displayName: 'Subbed video',
    });
    const queued = jobStore.create(siteCandidate, { mode: 'best', subtitleOutput: 'sidecar' });
    vi.mocked(client.exportYtDlp).mockResolvedValueOnce({
      jobId: queued.id,
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\page.mp4',
      sizeBytes: 2400,
      mimeType: 'video/mp4',
      sidecarOutputs: [
        {
          outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\page.en.vtt',
          fileName: 'page.en.vtt',
          mimeType: 'text/vtt',
          sizeBytes: 50,
        },
      ],
    });
    const deliverOutput = vi.fn().mockResolvedValue(3);

    const output = await runNativeExportJob({
      candidate: siteCandidate,
      job: queued,
      nativeClient: client,
      jobStore,
      readFullOutput: stubReadFullOutput(new Uint8Array([1, 2])),
      deliverOutput,
    });

    expect(client.exportYtDlp).toHaveBeenCalledWith(
      expect.objectContaining({
        subtitleLanguages: ['all'],
        writeSubtitles: true,
        embedSubtitles: false,
      }),
      expect.anything(),
    );
    expect(deliverOutput).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'page.mp4' }));
    expect(deliverOutput).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'page.en.vtt' }));
    expect(output.sidecarOutputs).toEqual([
      { fileName: 'page.en.vtt', mimeType: 'text/vtt', sizeBytes: 50 },
    ]);
  });

  test('forwards advanced yt-dlp binary path and tokenized custom args', async () => {
    const client = nativeClient();
    const jobStore = createJobStore(() => 100);
    const siteCandidate = candidate({
      id: 'candidate-advanced',
      protocol: 'unknown',
      sourceUrl: undefined,
      manifestUrl: undefined,
      pageUrl: 'https://example.com/watch?v=adv',
      displayName: 'Advanced video',
    });
    const queued = jobStore.create(siteCandidate, { mode: 'best', outputKind: 'mp4' });
    vi.mocked(client.exportYtDlp).mockResolvedValueOnce({
      jobId: queued.id,
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\page.mp4',
      sizeBytes: 10,
      mimeType: 'video/mp4',
    });

    await runNativeExportJob({
      candidate: siteCandidate,
      job: queued,
      nativeClient: client,
      jobStore,
      readFullOutput: stubReadFullOutput(new Uint8Array([1])),
      deliverOutput: vi.fn().mockResolvedValue(1),
      ytDlpBinaryPath: 'C:\\tools\\yt-dlp.exe',
      ytDlpCustomArgs: '--limit-rate 2M --user-agent "Mozilla 5.0"',
    });

    expect(client.exportYtDlp).toHaveBeenCalledWith(
      expect.objectContaining({
        binaryPath: 'C:\\tools\\yt-dlp.exe',
        extraArgs: ['--limit-rate', '2M', '--user-agent', 'Mozilla 5.0'],
      }),
      expect.anything(),
    );
  });

  test('omits yt-dlp overrides when none are supplied', async () => {
    const client = nativeClient();
    const jobStore = createJobStore(() => 100);
    const siteCandidate = candidate({
      id: 'candidate-plain',
      protocol: 'unknown',
      sourceUrl: undefined,
      manifestUrl: undefined,
      pageUrl: 'https://example.com/watch?v=plain',
      displayName: 'Plain video',
    });
    const queued = jobStore.create(siteCandidate, { mode: 'best', outputKind: 'mp4' });
    vi.mocked(client.exportYtDlp).mockResolvedValueOnce({
      jobId: queued.id,
      outputPath: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\page.mp4',
      sizeBytes: 10,
      mimeType: 'video/mp4',
    });

    await runNativeExportJob({
      candidate: siteCandidate,
      job: queued,
      nativeClient: client,
      jobStore,
      readFullOutput: stubReadFullOutput(new Uint8Array([1])),
      deliverOutput: vi.fn().mockResolvedValue(1),
    });

    const payload = vi.mocked(client.exportYtDlp).mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty('binaryPath');
    expect(payload).not.toHaveProperty('extraArgs');
  });

  test('keeps the ffmpeg engine for raw direct/manifest candidates', async () => {
    expect(shouldRouteToYtDlp(candidate())).toBe(false);
    expect(
      shouldRouteToYtDlp(candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://x/master.m3u8' })),
    ).toBe(false);
    expect(
      shouldRouteToYtDlp(candidate({ protocol: 'unknown', sourceUrl: undefined, manifestUrl: undefined })),
    ).toBe(true);
    expect(mapYtDlpQuality(job({ selection: { mode: 'best', outputKind: 'audio-only' } }))).toBe('audio-only');
    expect(mapYtDlpQuality(job({ selection: { mode: 'smallest' } }))).toBe('worst');
    expect(mapYtDlpQuality(job({ selection: { mode: 'best' } }))).toBe('best');
  });

  test('chooses MKV output when selected subtitles are present', async () => {
    const client = nativeClient();

    await runNativeExportJob({
      candidate: candidate({
        protocol: 'hls',
        displayName: 'Clear video.mp4',
        sourceUrl: undefined,
        manifestUrl: 'https://cdn.example.com/master.m3u8',
        subtitleTracks: [
          {
            id: 'sub-en',
            kind: 'subtitle',
            language: 'en',
            format: 'vtt',
            url: 'https://cdn.example.com/subs/en.vtt',
          },
        ],
      }),
      job: job({
        id: 'job-hls-subtitles',
        selection: { mode: 'best', subtitleTrackIds: ['sub-en'] },
      }),
      nativeClient: client,
      readFullOutput: stubReadFullOutput(new Uint8Array([1])),
      deliverOutput: vi.fn().mockResolvedValue(1),
    });

    expect(client.exportMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        outputKind: 'mkv',
        outputName: 'Clear video.mkv',
      }),
      expect.anything(),
    );
  });

  test('stores selected subtitle text before native export so sidecars survive mux failure', async () => {
    const store = createInMemorySubtitleStore();
    const client = nativeClient();
    vi.mocked(client.exportMedia).mockRejectedValueOnce(new Error('mux failed'));

    await expect(
      runNativeExportJob({
        candidate: candidate({
          protocol: 'hls',
          sourceUrl: undefined,
          manifestUrl: 'https://cdn.example.com/master.m3u8',
          subtitleTracks: [
            {
              id: 'sub-en',
              kind: 'subtitle',
              language: 'en',
              format: 'vtt',
              url: 'https://cdn.example.com/subs/en.vtt',
            },
          ],
        }),
        job: job({
          id: 'job-subtitle-store',
          selection: { mode: 'best', subtitleTrackIds: ['sub-en'] },
        }),
        nativeClient: client,
        subtitleStore: store,
        fetchText: vi.fn().mockResolvedValue('WEBVTT\n\n00:00.000 --> 00:01.000\nhello'),
      }),
    ).rejects.toThrow('mux failed');

    await expect(store.listByJob('job-subtitle-store')).resolves.toEqual([
      expect.objectContaining({
        jobId: 'job-subtitle-store',
        trackId: 'sub-en',
        language: 'en',
        format: 'vtt',
        fileName: 'Clear video.en.vtt',
        content: 'WEBVTT\n\n00:00.000 --> 00:01.000\nhello',
      }),
    ]);
  });

  test('keeps MP4 output and reports subtitle sidecars when sidecar output is selected', async () => {
    const store = createInMemorySubtitleStore();
    const client = nativeClient();

    const output = await runNativeExportJob({
      candidate: candidate({
        protocol: 'hls',
        displayName: 'Clear video.mp4',
        sourceUrl: undefined,
        manifestUrl: 'https://cdn.example.com/master.m3u8',
        subtitleTracks: [
          {
            id: 'sub-en',
            kind: 'subtitle',
            language: 'en',
            label: 'English',
            format: 'vtt',
            url: 'https://cdn.example.com/subs/en.vtt',
          },
        ],
      }),
      job: job({
        id: 'job-sidecar-subtitles',
        selection: {
          mode: 'best',
          subtitleTrackIds: ['sub-en'],
          subtitleOutput: 'sidecar',
        },
      }),
      nativeClient: client,
      subtitleStore: store,
      fetchText: vi.fn().mockResolvedValue('WEBVTT\n\n00:00.000 --> 00:01.000\nhello'),
      readFullOutput: stubReadFullOutput(new Uint8Array([1])),
      deliverOutput: vi.fn().mockResolvedValue(1),
    });

    expect(client.exportMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        outputKind: 'mp4',
        outputName: 'Clear video.mp4',
      }),
      expect.anything(),
    );
    expect(output.sidecarOutputs).toEqual([
      {
        fileName: 'Clear video.en.vtt',
        mimeType: 'text/vtt',
        sizeBytes: 37,
      },
    ]);
  });

  test('rejects protected media before invoking the native helper', async () => {
    const client = nativeClient();

    await expect(
      runNativeExportJob({
        candidate: candidate({ status: 'protected', protection: { kind: 'drm', drmSystems: ['widevine'] } }),
        job: job(),
        nativeClient: client,
      }),
    ).rejects.toThrow(/Protected media/);

    expect(client.exportMedia).not.toHaveBeenCalled();
  });

  test('does not claim success when output delivery is not configured', async () => {
    const client = nativeClient();

    await expect(
      runNativeExportJob({
        candidate: candidate(),
        job: job({ selection: { mode: 'best', outputKind: 'mp4' } }),
        nativeClient: client,
      }),
    ).rejects.toThrow(/delivery is unavailable/i);
  });

  test('propagates delivery failure instead of returning a phantom output', async () => {
    const client = nativeClient();

    await expect(
      runNativeExportJob({
        candidate: candidate(),
        job: job({ selection: { mode: 'best', outputKind: 'mp4' } }),
        nativeClient: client,
        readFullOutput: stubReadFullOutput(new Uint8Array([1, 2])),
        deliverOutput: vi.fn().mockRejectedValue(new Error('downloads API failed')),
      }),
    ).rejects.toThrow('downloads API failed');
  });
});

describe('parseYtDlpCustomArgs', () => {
  test('returns empty for blank/undefined input', () => {
    expect(parseYtDlpCustomArgs(undefined)).toEqual([]);
    expect(parseYtDlpCustomArgs('')).toEqual([]);
    expect(parseYtDlpCustomArgs('   ')).toEqual([]);
  });

  test('tokenizes on whitespace and honors quotes', () => {
    expect(parseYtDlpCustomArgs('--limit-rate 2M --user-agent "Mozilla 5.0"')).toEqual([
      '--limit-rate',
      '2M',
      '--user-agent',
      'Mozilla 5.0',
    ]);
    expect(parseYtDlpCustomArgs("--add-header 'X-Test: 1'")).toEqual(['--add-header', 'X-Test: 1']);
  });

  test('drops tokens containing control characters', () => {
    expect(parseYtDlpCustomArgs('--ok value')).toEqual(['--ok', 'value']);
  });
});
