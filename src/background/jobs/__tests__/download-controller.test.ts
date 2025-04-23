import { describe, expect, test, vi } from 'vitest';
import type { DownloadJob, JobOutput, MediaCandidate } from '@/video_downloader_types_skeleton';
import { createHistoryStore } from '../history-store';
import { createJobStore } from '../job-store';
import { createDownloadController } from '../download-controller';

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
