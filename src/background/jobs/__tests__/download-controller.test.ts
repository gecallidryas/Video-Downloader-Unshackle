import { describe, expect, test, vi } from 'vitest';
import type { DownloadJob, JobOutput, MediaCandidate } from '@/video_downloader_types_skeleton';
import { createHistoryStore } from '../history-store';
import { createJobStore } from '../job-store';
import { createDownloadController } from '../download-controller';
import { NativeFfmpegClientError } from '@/src/native/native-ffmpeg-client';
import { SegmentFetchError } from '@/src/core/download/error-classification';

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: 'Direct video',
    sourceUrl: 'https://cdn.example.com/video.mp4',
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

function job(candidateId = 'candidate-1'): DownloadJob {
  return {
    id: 'job-1',
    candidateId,
    tabId: 7,
    phase: 'queued',
    createdAt: 1,
    updatedAt: 1,
    selection: { mode: 'best' },
    progressPct: 0,
    bytesDownloaded: 0,
  };
}

describe('download controller decision flow', () => {
  test('routes range-capable large direct media through the browser range downloader', async () => {
    const downloadFile = vi.fn();
    const downloadDirectWithRanges = vi.fn().mockResolvedValue({
      fileName: 'direct-video.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 6_000_000,
      notes: ['Browser assembled direct download from HTTP byte ranges.'],
    } satisfies JobOutput);
    const controller = createDownloadController({
      downloadFile,
      downloadDirectWithRanges,
      runHls: vi.fn(),
      runDash: vi.fn(),
      probeDirectRange: vi.fn().mockResolvedValue({
        acceptsRanges: true,
        contentLength: 6_000_000,
      }),
    });

    const output = await controller.start(candidate(), job(), {
      settings: {
        enableBrowserFallbacks: true,
        directRangeMinBytes: 5_000_000,
      },
    });

    expect(downloadDirectWithRanges).toHaveBeenCalledWith({
      candidate: expect.objectContaining({ protocol: 'direct' }),
      job: expect.objectContaining({ id: 'job-1' }),
      signal: expect.any(AbortSignal),
    });
    expect(downloadFile).not.toHaveBeenCalled();
    expect(output.notes).toContain('Browser assembled direct download from HTTP byte ranges.');
  });

  test('threads the configured bandwidth limit into the direct range downloader', async () => {
    const downloadDirectWithRanges = vi.fn().mockResolvedValue({
      fileName: 'direct-video.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 6_000_000,
    } satisfies JobOutput);
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      downloadDirectWithRanges,
      runHls: vi.fn(),
      runDash: vi.fn(),
      probeDirectRange: vi.fn().mockResolvedValue({
        acceptsRanges: true,
        contentLength: 6_000_000,
      }),
    });

    await controller.start(candidate(), job(), {
      settings: {
        enableBrowserFallbacks: true,
        directRangeMinBytes: 5_000_000,
        maxBandwidthPerHostKBps: 750,
      },
    });

    expect(downloadDirectWithRanges).toHaveBeenCalledWith(
      expect.objectContaining({ bandwidthBytesPerSecond: 750 * 1024 }),
    );
  });

  test('omits the bandwidth limit for direct range downloads when unset', async () => {
    const downloadDirectWithRanges = vi.fn().mockResolvedValue({
      fileName: 'direct-video.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 6_000_000,
    } satisfies JobOutput);
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      downloadDirectWithRanges,
      runHls: vi.fn(),
      runDash: vi.fn(),
      probeDirectRange: vi.fn().mockResolvedValue({
        acceptsRanges: true,
        contentLength: 6_000_000,
      }),
    });

    await controller.start(candidate(), job(), {
      settings: {
        enableBrowserFallbacks: true,
        directRangeMinBytes: 5_000_000,
      },
    });

    expect(downloadDirectWithRanges).toHaveBeenCalledWith(
      expect.not.objectContaining({ bandwidthBytesPerSecond: expect.anything() }),
    );
  });

  test('falls back to chrome downloads when direct media does not support ranges', async () => {
    const downloadFile = vi.fn().mockResolvedValue({
      fileName: 'direct-video.mp4',
      mimeType: 'video/mp4',
      downloadId: 42,
    } satisfies JobOutput);
    const downloadDirectWithRanges = vi.fn();
    const controller = createDownloadController({
      downloadFile,
      downloadDirectWithRanges,
      runHls: vi.fn(),
      runDash: vi.fn(),
      probeDirectRange: vi.fn().mockResolvedValue({
        acceptsRanges: false,
        contentLength: 6_000_000,
      }),
    });

    const output = await controller.start(candidate(), job(), {
      settings: {
        enableBrowserFallbacks: true,
        directRangeMinBytes: 5_000_000,
      },
    });

    expect(downloadDirectWithRanges).not.toHaveBeenCalled();
    expect(downloadFile).toHaveBeenCalledOnce();
    expect(output).toMatchObject({ downloadId: 42 });
  });

  test('records non-retryable direct range status failures', async () => {
    const jobStore = createJobStore(() => 500);
    const historyStore = createHistoryStore(() => 500);
    const downloadDirectWithRanges = vi
      .fn()
      .mockRejectedValue(new SegmentFetchError(404, 'Not Found'));
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      downloadDirectWithRanges,
      runHls: vi.fn(),
      runDash: vi.fn(),
      probeDirectRange: vi.fn().mockResolvedValue({
        acceptsRanges: true,
        contentLength: 6_000_000,
      }),
    });
    const queuedJob = jobStore.create(candidate(), { mode: 'best' });

    await expect(
      controller.runManaged(candidate(), queuedJob, {
        jobStore,
        historyStore,
        settings: {
          enableBrowserFallbacks: true,
          directRangeMinBytes: 5_000_000,
        },
      }),
    ).rejects.toThrow('Segment fetch failed: 404 Not Found');

    expect(jobStore.get(queuedJob.id)).toMatchObject({
      phase: 'failed',
      failure: {
        code: 'NETWORK_ERROR',
        retryable: false,
      },
    });
  });

  test('routes direct media without trim through chrome downloads', async () => {
    const downloadFile = vi.fn().mockResolvedValue({
      fileName: 'direct-video.mp4',
      mimeType: 'video/mp4',
      downloadId: 42,
    } satisfies JobOutput);
    const controller = createDownloadController({
      downloadFile,
      runHls: vi.fn(),
      runDash: vi.fn(),
    });

    const output = await controller.start(candidate(), job(), {
      selection: {
        mode: 'best',
      },
      settings: { defaultOutputFormat: 'mp4' },
    });

    expect(downloadFile).toHaveBeenCalled();
    expect(output).toMatchObject({
      downloadId: 42,
    });
  });

  test('auto-deletes job storage after a completed save when enabled', async () => {
    const cleanupAfterSave = vi.fn(async () => undefined);
    const controller = createDownloadController({
      downloadFile: vi.fn().mockResolvedValue({
        fileName: 'direct-video.mp4',
        mimeType: 'video/mp4',
        downloadId: 42,
      } satisfies JobOutput),
      runHls: vi.fn(),
      runDash: vi.fn(),
      cleanupAfterSave,
    });
    const jobStore = createJobStore(() => 10);
    const historyStore = createHistoryStore(() => 10);
    const queuedJob = jobStore.create(candidate(), { mode: 'best' });

    await controller.runManaged(candidate(), queuedJob, {
      jobStore,
      historyStore,
      settings: { autoDeleteAfterSave: true },
    });

    expect(cleanupAfterSave).toHaveBeenCalledWith(queuedJob.id);
  });

  test('routes direct media with trim through the native runner when configured', async () => {
    const nativeExport = vi.fn().mockResolvedValue({
      fileName: 'trimmed.mp4',
      mimeType: 'video/mp4',
      outputUrl: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\trimmed.mp4',
    } satisfies JobOutput);
    const downloadFile = vi.fn();
    const controller = createDownloadController({
      downloadFile,
      runHls: vi.fn(),
      runDash: vi.fn(),
      nativeExport,
    });

    const output = await controller.start(candidate(), job(), {
      selection: { mode: 'best', trim: { startSec: 5, endSec: 10 } },
    });

    expect(nativeExport).toHaveBeenCalledWith({
      candidate: expect.objectContaining({ protocol: 'direct' }),
      job: expect.objectContaining({ selection: expect.objectContaining({ trim: { startSec: 5, endSec: 10 } }) }),
    });
    expect(downloadFile).not.toHaveBeenCalled();
    expect(output).toMatchObject({ fileName: 'trimmed.mp4' });
  });

  test('routes clear HLS and DASH through the native runner when configured', async () => {
    const nativeExport = vi.fn().mockResolvedValue({ fileName: 'native.mp4', mimeType: 'video/mp4' });
    const fetchText = vi.fn();
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls: vi.fn(),
      runDash: vi.fn(),
      fetchText,
      nativeExport,
    });

    await controller.start(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job(),
      { selection: { mode: 'best' } },
    );
    await controller.start(
      candidate({ protocol: 'dash', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/manifest.mpd' }),
      job(),
      { selection: { mode: 'best' } },
    );

    expect(nativeExport).toHaveBeenCalledTimes(2);
    expect(fetchText).not.toHaveBeenCalled();
  });

  test('falls back to the browser HLS runner when the native helper is unavailable', async () => {
    const nativeExport = vi.fn().mockRejectedValue(
      new NativeFfmpegClientError(
        'NATIVE_UNAVAILABLE',
        'Native messaging API is unavailable.',
      ),
    );
    const runHls = vi.fn().mockResolvedValue({ fileName: 'hls.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXTINF:1,\nseg.ts\n#EXT-X-ENDLIST');
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
      nativeExport,
    });

    const output = await controller.start(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job(),
      { selection: { mode: 'best' } },
    );

    expect(nativeExport).toHaveBeenCalledTimes(1);
    expect(fetchText).toHaveBeenCalledWith('https://cdn.example.com/master.m3u8', expect.any(Object));
    expect(runHls).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({ protocol: 'hls' }),
      }),
    );
    expect(output).toEqual({ fileName: 'hls.mp4', mimeType: 'video/mp4' });
  });

  test('does not fall back to browser HLS when browser fallbacks are disabled', async () => {
    const nativeExport = vi.fn().mockRejectedValue(
      new NativeFfmpegClientError(
        'NATIVE_UNAVAILABLE',
        'Native messaging API is unavailable.',
      ),
    );
    const runHls = vi.fn();
    const fetchText = vi.fn();
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
      nativeExport,
      enableBrowserFallbacks: false,
    });

    await expect(
      controller.start(
        candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
        job(),
        { selection: { mode: 'best' } },
      ),
    ).rejects.toThrow('Native messaging API is unavailable.');

    expect(fetchText).not.toHaveBeenCalled();
    expect(runHls).not.toHaveBeenCalled();
  });

  test('routes page/site candidates to the yt-dlp engine when enabled', async () => {
    const nativeExport = vi.fn().mockResolvedValue({ fileName: 'page.mp4', mimeType: 'video/mp4' });
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls: vi.fn(),
      runDash: vi.fn(),
      nativeExport,
    });

    await controller.start(
      candidate({ protocol: 'unknown', sourceUrl: undefined, manifestUrl: undefined, pageUrl: 'https://site.example/watch' }),
      job(),
      { selection: { mode: 'best' } },
    );

    expect(nativeExport).toHaveBeenCalledTimes(1);
  });

  test('errors clearly for page candidates when the yt-dlp engine is disabled', async () => {
    const nativeExport = vi.fn();
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls: vi.fn(),
      runDash: vi.fn(),
      nativeExport,
      useNativeYtDlp: false,
    });

    await expect(
      controller.start(
        candidate({ protocol: 'unknown', sourceUrl: undefined, manifestUrl: undefined, pageUrl: 'https://site.example/watch' }),
        job(),
        { selection: { mode: 'best' } },
      ),
    ).rejects.toThrow(/yt-dlp engine/);

    expect(nativeExport).not.toHaveBeenCalled();
  });

  test('skips the native ffmpeg engine for HLS when it is disabled, preferring the browser runner', async () => {
    const nativeExport = vi.fn();
    const runHls = vi.fn().mockResolvedValue({ fileName: 'hls.mp4', mimeType: 'video/mp4' });
    const fetchText = vi.fn().mockResolvedValue('#EXTM3U\n#EXTINF:1,\nseg.ts\n#EXT-X-ENDLIST');
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
      nativeExport,
      useNativeFfmpeg: false,
    });

    await controller.start(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job(),
      { selection: { mode: 'best' } },
    );

    expect(nativeExport).not.toHaveBeenCalled();
    expect(runHls).toHaveBeenCalledTimes(1);
  });

  test('errors for page candidates when the yt-dlp engine is disabled even with browser fallbacks on', async () => {
    const nativeExport = vi.fn();
    const runHls = vi.fn();
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      nativeExport,
      useNativeYtDlp: false,
      enableBrowserFallbacks: true,
    });

    await expect(
      controller.start(
        candidate({ protocol: 'blob', sourceUrl: undefined, manifestUrl: undefined, pageUrl: 'https://site.example/v' }),
        job(),
        { selection: { mode: 'best' } },
      ),
    ).rejects.toThrow(/yt-dlp engine/);

    expect(runHls).not.toHaveBeenCalled();
  });

  test('skips native export when native features are disabled', async () => {
    const nativeExport = vi.fn();
    const runHls = vi.fn().mockResolvedValue({ fileName: 'hls.ts', mimeType: 'video/mp2t' });
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXTINF:1,\nseg.ts\n#EXT-X-ENDLIST');
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
      nativeExport,
      enableNativeFeatures: false,
    });

    await controller.start(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job(),
      { selection: { mode: 'best' } },
    );

    expect(nativeExport).not.toHaveBeenCalled();
    expect(runHls).toHaveBeenCalledOnce();
  });

  test('falls back to a full direct download with a trim note when native trim is unavailable', async () => {
    const nativeExport = vi.fn().mockRejectedValue(
      new NativeFfmpegClientError(
        'NATIVE_UNAVAILABLE',
        'Native messaging API is unavailable.',
      ),
    );
    const downloadFile = vi.fn().mockResolvedValue({
      fileName: 'direct-video.mp4',
      mimeType: 'video/mp4',
      downloadId: 44,
    } satisfies JobOutput);
    const controller = createDownloadController({
      downloadFile,
      runHls: vi.fn(),
      runDash: vi.fn(),
      nativeExport,
    });

    const output = await controller.start(candidate(), job(), {
      selection: { mode: 'best', trim: { startSec: 5, endSec: 10 } },
    });

    expect(nativeExport).toHaveBeenCalledOnce();
    expect(downloadFile).toHaveBeenCalledOnce();
    expect(output).toMatchObject({
      fileName: 'direct-video.mp4',
      notes: [
        'Trim is not supported for direct downloads yet; downloaded the full file.',
      ],
    });
  });

  test('routes explicit browser WebM trim through the browser direct trim runner', async () => {
    const nativeExport = vi.fn();
    const downloadFile = vi.fn();
    const browserDirectTrim = vi.fn().mockResolvedValue({
      fileName: 'Direct video.trim.webm',
      mimeType: 'video/webm',
      downloadId: 45,
      notes: ['Browser-recorded WebM clip; not an original-quality stream copy.'],
    } satisfies JobOutput);
    const controller = createDownloadController({
      downloadFile,
      runHls: vi.fn(),
      runDash: vi.fn(),
      nativeExport,
      browserDirectTrim,
    });

    const output = await controller.start(candidate(), job(), {
      selection: {
        mode: 'best',
        outputKind: 'webm',
        trim: { startSec: 5, endSec: 10 },
      },
    });

    expect(browserDirectTrim).toHaveBeenCalledWith({
      candidate: expect.objectContaining({ protocol: 'direct' }),
      job: expect.objectContaining({
        selection: expect.objectContaining({
          outputKind: 'webm',
          trim: { startSec: 5, endSec: 10 },
        }),
      }),
    });
    expect(nativeExport).not.toHaveBeenCalled();
    expect(downloadFile).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      fileName: 'Direct video.trim.webm',
      mimeType: 'video/webm',
    });
  });

  test('falls back to the browser DASH runner when the native helper is unavailable and passes candidate', async () => {
    const nativeExport = vi.fn().mockRejectedValue(
      new NativeFfmpegClientError(
        'NATIVE_UNAVAILABLE',
        'Native messaging API is unavailable.',
      ),
    );
    const runDash = vi.fn().mockResolvedValue({ fileName: 'dash.bin', mimeType: 'application/octet-stream' });
    const fetchText = vi
      .fn()
      .mockResolvedValue(
        '<MPD mediaPresentationDuration="PT1S"><Period><AdaptationSet contentType="video"><Representation id="v1"><BaseURL>video.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>',
      );
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls: vi.fn(),
      runDash,
      fetchText,
      nativeExport,
    });

    const output = await controller.start(
      candidate({
        protocol: 'dash',
        sourceUrl: undefined,
        manifestUrl: 'https://cdn.example.com/manifest.mpd',
      }),
      job(),
      { selection: { mode: 'best' } },
    );

    expect(runDash).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({ protocol: 'dash' }),
      }),
    );
    expect(output).toEqual({ fileName: 'dash.bin', mimeType: 'application/octet-stream' });
  });

  test('records browser runner assembly errors with a useful failure message', async () => {
    const jobStore = createJobStore(() => 200);
    const historyStore = createHistoryStore(() => 200);
    const runHls = vi.fn().mockRejectedValue(new Error('Blob assembly failed for raw HLS export.'));
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXTINF:1,\nseg.ts\n#EXT-X-ENDLIST');
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
    });
    const hlsCandidate = candidate({
      protocol: 'hls',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/master.m3u8',
    });
    const queuedJob = jobStore.create(hlsCandidate, { mode: 'best' });

    await expect(
      controller.runManaged(hlsCandidate, queuedJob, {
        jobStore,
        historyStore,
      }),
    ).rejects.toThrow('Blob assembly failed for raw HLS export.');

    expect(jobStore.get(queuedJob.id)).toMatchObject({
      phase: 'failed',
      failure: {
        code: 'ASSEMBLY_ERROR',
        message: 'Blob assembly failed for raw HLS export.',
      },
    });
  });

  test('does not fall back when native export fails for a real processing error', async () => {
    const nativeExport = vi.fn().mockRejectedValue(new Error('FFmpeg exited with code 1.'));
    const downloadFile = vi.fn();
    const controller = createDownloadController({
      downloadFile,
      runHls: vi.fn(),
      runDash: vi.fn(),
      nativeExport,
    });

    await expect(
      controller.start(candidate(), job(), {
        selection: { mode: 'best', trim: { startSec: 5, endSec: 10 } },
      }),
    ).rejects.toThrow('FFmpeg exited with code 1.');

    expect(downloadFile).not.toHaveBeenCalled();
  });

  test('fetches and parses HLS and DASH manifests when only manifest URLs are available', async () => {
    const runHls = vi.fn().mockResolvedValue({ fileName: 'hls.mp4', mimeType: 'video/mp4' });
    const runDash = vi.fn().mockResolvedValue({ fileName: 'dash.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValueOnce('#EXTM3U\n#EXTINF:1,\nseg.ts\n#EXT-X-ENDLIST')
      .mockResolvedValueOnce(
        '<MPD mediaPresentationDuration="PT1S"><Period><AdaptationSet contentType="video"><Representation id="v1"><BaseURL>video.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>',
      );
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash,
      fetchText,
    });

    await controller.start(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/live.m3u8' }),
      job(),
      { selection: { mode: 'best' } },
    );
    await controller.start(
      candidate({ protocol: 'dash', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/manifest.mpd' }),
      job(),
      { selection: { mode: 'best' } },
    );

    expect(fetchText).toHaveBeenCalledWith('https://cdn.example.com/live.m3u8', expect.any(Object));
    expect(fetchText).toHaveBeenCalledWith('https://cdn.example.com/manifest.mpd', expect.any(Object));
    expect(runHls).toHaveBeenCalled();
    expect(runDash).toHaveBeenCalled();
  });

  test('allows protected HLS candidate when suppressProtectedDownloads is false', async () => {
    const runHls = vi.fn().mockResolvedValue({ fileName: 'drm.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXTINF:1,\nseg.ts\n#EXT-X-ENDLIST');
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
      suppressProtectedDownloads: false,
    });

    const protectedCandidate = candidate({
      protocol: 'hls',
      status: 'protected',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/drm.m3u8',
      protection: { kind: 'drm', drmSystems: ['widevine'] },
    });

    // Should NOT throw — suppressProtectedDownloads: false means allow protected media
    await expect(
      controller.start(protectedCandidate, job(), { selection: { mode: 'best' } }),
    ).resolves.toMatchObject({ fileName: 'drm.mp4' });

    expect(fetchText).toHaveBeenCalledWith('https://cdn.example.com/drm.m3u8', expect.any(Object));
    expect(runHls).toHaveBeenCalledWith(
      expect.objectContaining({ allowProtected: true }),
    );
  });

  test('rejects protected HLS candidate when suppressProtectedDownloads is unset (default)', async () => {
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls: vi.fn(),
      runDash: vi.fn(),
      fetchText: vi.fn(),
      // suppressProtectedDownloads intentionally omitted — defaults to blocking
    });

    const protectedCandidate = candidate({
      protocol: 'hls',
      status: 'protected',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/drm.m3u8',
      protection: { kind: 'drm', drmSystems: ['widevine'] },
    });

    await expect(
      controller.start(protectedCandidate, job(), { selection: { mode: 'best' } }),
    ).rejects.toThrow('Protected media cannot be downloaded');
  });

  test('threads concurrency settings through to runHls', async () => {
    const runHls = vi.fn().mockResolvedValue({ fileName: 'hls.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST');
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
    });

    await controller.start(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job(),
      {
        selection: { mode: 'best' },
        settings: {
          maxConcurrentSegments: 8,
          maxConcurrentSegmentsPerHost: 4,
        },
      },
    );

    expect(runHls).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 8,
        maxConcurrentPerHost: 4,
      }),
    );
  });

  test('threads max bandwidth per host through to runHls as bytes/sec', async () => {
    const runHls = vi.fn().mockResolvedValue({ fileName: 'hls.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST');
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
    });

    await controller.start(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job(),
      {
        selection: { mode: 'best' },
        settings: { maxBandwidthPerHostKBps: 500 },
      },
    );

    expect(runHls).toHaveBeenCalledWith(
      expect.objectContaining({ bandwidthBytesPerSecond: 500 * 1024 }),
    );
  });

  test('omits bandwidth from runHls when max bandwidth is zero or unset', async () => {
    const runHls = vi.fn().mockResolvedValue({ fileName: 'hls.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST');
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
    });

    await controller.start(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job(),
      {
        selection: { mode: 'best' },
        settings: { maxBandwidthPerHostKBps: 0 },
      },
    );

    expect(runHls.mock.calls[0][0]).not.toHaveProperty('bandwidthBytesPerSecond');
  });

  test('threads max bandwidth per host through to runDash as bytes/sec', async () => {
    const runDash = vi.fn().mockResolvedValue({ fileName: 'dash.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValue(
        '<MPD mediaPresentationDuration="PT1S"><Period><AdaptationSet contentType="video"><Representation id="v1"><BaseURL>video.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>',
      );
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls: vi.fn(),
      runDash,
      fetchText,
    });

    await controller.start(
      candidate({ protocol: 'dash', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/manifest.mpd' }),
      job(),
      {
        selection: { mode: 'best' },
        settings: { maxBandwidthPerHostKBps: 250 },
      },
    );

    expect(runDash).toHaveBeenCalledWith(
      expect.objectContaining({ bandwidthBytesPerSecond: 250 * 1024 }),
    );
  });

  test('signalAbort cancels the in-flight run without touching the job store', async () => {
    const runHls = vi.fn(async (input: { signal?: AbortSignal }) => {
      await new Promise<void>((_resolve, reject) => {
        input.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      });
      return { fileName: 'never.mp4', mimeType: 'video/mp4' };
    });
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXTINF:1,\nseg.ts\n#EXT-X-ENDLIST');
    const jobStore = createJobStore(() => 1);
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
    });
    const hlsCandidate = candidate({
      protocol: 'hls',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/master.m3u8',
    });
    const queuedJob = jobStore.create(hlsCandidate, { mode: 'best' });

    const pending = controller.start(hlsCandidate, queuedJob, {
      selection: { mode: 'best' },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.signalAbort(queuedJob.id);

    await expect(pending).rejects.toThrow('aborted');
    // signalAbort must NOT mutate the job store (queue owns the phase).
    expect(jobStore.get(queuedJob.id)).toMatchObject({ phase: 'queued' });
  });

  test('threads segment timeout settings through to runHls', async () => {
    const runHls = vi.fn().mockResolvedValue({ fileName: 'hls.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST');
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
    });

    await controller.start(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job(),
      {
        selection: { mode: 'best' },
        settings: {
          segmentTimeoutMs: 12_000,
        },
      },
    );

    expect(runHls).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentTimeoutMs: 12_000,
      }),
    );
  });

  test('threads default quality policy through to runHls and clears stale picker variant', async () => {
    const runHls = vi.fn().mockResolvedValue({ fileName: 'hls.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST');
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
    });

    await controller.start(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job(),
      {
        selection: { mode: 'custom', variantId: 'stale-ui-choice' },
        settings: {
          defaultQualityPolicy: 'highest',
        },
      },
    );

    expect(runHls).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityPolicy: 'highest',
        job: expect.objectContaining({
          selection: expect.not.objectContaining({ variantId: 'stale-ui-choice' }),
        }),
      }),
    );
  });

  test('uses loaded default quality policy settings for queued HLS jobs', async () => {
    const runHls = vi.fn().mockResolvedValue({ fileName: 'hls.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST');
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
    });
    controller.updateSettings({ defaultQualityPolicy: 'lowest' });

    await controller.start(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job(),
      {
        selection: { mode: 'custom', variantId: 'stale-ui-choice' },
      },
    );

    expect(runHls).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityPolicy: 'lowest',
        job: expect.objectContaining({
          selection: expect.objectContaining({ mode: 'smallest' }),
        }),
      }),
    );
  });

  test('threads concurrency settings through to runDash', async () => {
    const runDash = vi.fn().mockResolvedValue({ fileName: 'dash.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValue(
        '<MPD mediaPresentationDuration="PT1S"><Period><AdaptationSet contentType="video"><Representation id="v1"><BaseURL>video.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>',
      );
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls: vi.fn(),
      runDash,
      fetchText,
    });

    await controller.start(
      candidate({ protocol: 'dash', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/manifest.mpd' }),
      job(),
      {
        selection: { mode: 'best' },
        settings: {
          maxConcurrentSegments: 12,
          maxConcurrentSegmentsPerHost: 6,
        },
      },
    );

    expect(runDash).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 12,
        maxConcurrentPerHost: 6,
      }),
    );
  });

  test('threads segment timeout settings through to runDash', async () => {
    const runDash = vi.fn().mockResolvedValue({ fileName: 'dash.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValue(
        '<MPD mediaPresentationDuration="PT1S"><Period><AdaptationSet contentType="video"><Representation id="v1"><BaseURL>video.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>',
      );
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls: vi.fn(),
      runDash,
      fetchText,
    });

    await controller.start(
      candidate({ protocol: 'dash', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/manifest.mpd' }),
      job(),
      {
        selection: { mode: 'best' },
        settings: {
          segmentTimeoutMs: 12_000,
        },
      },
    );

    expect(runDash).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentTimeoutMs: 12_000,
      }),
    );
  });

  test('omits concurrency fields from runHls when settings are not provided', async () => {
    const runHls = vi.fn().mockResolvedValue({ fileName: 'hls.mp4', mimeType: 'video/mp4' });
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST');
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
    });

    await controller.start(
      candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job(),
      { selection: { mode: 'best' } },
    );

    const callArg = runHls.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('concurrency');
    expect(callArg).not.toHaveProperty('maxConcurrentPerHost');
  });

  test('abort aborts the active fetch signal threaded through runHls', async () => {
    const seenSignals: AbortSignal[] = [];
    const runHls = vi.fn(async (input: { signal?: AbortSignal }) => {
      if (input.signal) {
        seenSignals.push(input.signal);
      }
      await new Promise<void>((resolve, reject) => {
        input.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      });
      return { fileName: 'never.mp4', mimeType: 'video/mp4' };
    });
    const fetchText = vi
      .fn()
      .mockResolvedValue('#EXTM3U\n#EXTINF:1,\nseg.ts\n#EXT-X-ENDLIST');
    const jobStore = createJobStore(() => 1);
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls,
      runDash: vi.fn(),
      fetchText,
    });
    const hlsCandidate = candidate({
      protocol: 'hls',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/master.m3u8',
    });
    const queuedJob = jobStore.create(hlsCandidate, { mode: 'best' });

    const pending = controller.start(hlsCandidate, queuedJob, {
      selection: { mode: 'best' },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    await controller.abort(queuedJob.id, { jobStore });

    await expect(pending).rejects.toThrow('aborted');
    expect(seenSignals).toHaveLength(1);
    expect(seenSignals[0]?.aborted).toBe(true);
  });

  test('rejects protected candidates before fetching segments and records controller failures', async () => {
    const jobStore = createJobStore(() => 300);
    const historyStore = createHistoryStore(() => 300);
    const controller = createDownloadController({
      downloadFile: vi.fn(),
      runHls: vi.fn(),
      runDash: vi.fn(),
    });
    const protectedCandidate = candidate({
      status: 'protected',
      protection: { kind: 'drm', drmSystems: ['widevine'] },
    });
    const queuedJob = jobStore.create(protectedCandidate, { mode: 'best' });

    await expect(
      controller.runManaged(protectedCandidate, queuedJob, {
        jobStore,
        historyStore,
      }),
    ).rejects.toThrow('Protected media cannot be downloaded by the generic pipeline.');

    expect(jobStore.get(queuedJob.id)).toMatchObject({
      phase: 'failed',
      failure: { code: 'PROTECTED_MEDIA' },
    });
    expect(historyStore.list()).toEqual([
      expect.objectContaining({ status: 'failed', failureCode: 'PROTECTED_MEDIA' }),
    ]);
  });
});
