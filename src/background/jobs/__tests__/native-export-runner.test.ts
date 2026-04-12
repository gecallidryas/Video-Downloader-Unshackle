import { describe, expect, test, vi } from 'vitest';
import type { DownloadJob, MediaCandidate } from '@/video_downloader_types_skeleton';
import { createJobStore } from '../job-store';
import { runNativeExportJob } from '../native-export-runner';
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
