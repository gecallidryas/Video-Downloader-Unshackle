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
