import { describe, expect, test, vi } from 'vitest';
import type { DownloadJob, MediaCandidate } from '@/video_downloader_types_skeleton';
import * as segmentScheduler from '@/src/core/download/segment-scheduler';
import { parseMpd } from '@/src/core/dash/parse-mpd';
import { runBrowserDashExportJob } from '../browser-dash-runner';

function candidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'candidate-dash-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'dash',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: 'dash-movie.mp4',
    manifestUrl: 'https://cdn.example.com/dash/manifest.mpd',
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
    id: 'job-dash-1',
    candidateId: 'candidate-dash-1',
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

describe('browser DASH export runner', () => {
  test('fetches DASH segments through the DASH job and exports single-track raw M4S', async () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/manifest.mpd',
      content: [
        '<MPD mediaPresentationDuration="PT8S">',
        '<Period>',
        '<AdaptationSet contentType="video">',
        '<Representation id="v1" bandwidth="1000">',
        '<BaseURL>video/</BaseURL>',
        '<SegmentTemplate duration="4" startNumber="1" initialization="init.mp4" media="seg-$Number$.m4s" />',
        '</Representation>',
        '</AdaptationSet>',
        '</Period>',
        '</MPD>',
      ].join(''),
    });
    const fetchBytes = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.cache).toBe('no-store');
      expect(init.credentials).toBe('include');
      expect(init.signal).toBeInstanceOf(AbortSignal);

      if (url.endsWith('init.mp4')) {
        return new Uint8Array([1, 2]);
      }

      return new Uint8Array(url.endsWith('seg-1.m4s') ? [3] : [4]);
    });
    const createObjectUrl = vi.fn().mockReturnValue('blob:raw-dash');
    const download = vi.fn().mockResolvedValue(91);

    await expect(
      runBrowserDashExportJob({
        candidate: candidate(),
        job: job({ selection: { mode: 'best', saveAs: true } }),
        manifest,
        fetchBytes,
        createObjectUrl,
        revokeObjectUrl: vi.fn(),
        download,
      }),
    ).resolves.toMatchObject({
      fileName: 'dash-movie.m4s',
      mimeType: 'video/iso.segment',
      outputUrl: 'blob:raw-dash',
      downloadId: 91,
      sizeBytes: 4,
    });

    expect(fetchBytes.mock.calls.map(([url]) => url)).toEqual([
      'https://cdn.example.com/dash/video/init.mp4',
      'https://cdn.example.com/dash/video/seg-1.m4s',
      'https://cdn.example.com/dash/video/seg-2.m4s',
    ]);
    expect(download).toHaveBeenCalledWith({
      url: 'blob:raw-dash',
      filename: 'dash-movie.m4s',
      saveAs: true,
    });
  });

  test('exports BIN when raw DASH output cannot be confidently named M4S', async () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/manifest.mpd',
      content: [
        '<MPD mediaPresentationDuration="PT4S">',
        '<Period>',
        '<AdaptationSet contentType="video">',
        '<Representation id="v1">',
        '<BaseURL>combined.mp4</BaseURL>',
        '</Representation>',
        '</AdaptationSet>',
        '</Period>',
        '</MPD>',
      ].join(''),
    });

    await expect(
      runBrowserDashExportJob({
        candidate: candidate(),
        job: job(),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(new Uint8Array([9])),
        createObjectUrl: vi.fn().mockReturnValue('blob:raw-dash-bin'),
        revokeObjectUrl: vi.fn(),
        download: vi.fn().mockResolvedValue(92),
      }),
    ).resolves.toMatchObject({
      fileName: 'dash-movie.bin',
      mimeType: 'application/octet-stream',
      sizeBytes: 1,
    });
  });

  test('passes scheduling options through to the DASH job', async () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/manifest.mpd',
      content: [
        '<MPD mediaPresentationDuration="PT4S">',
        '<Period><AdaptationSet contentType="video"><Representation id="v1">',
        '<BaseURL>video.mp4</BaseURL>',
        '</Representation></AdaptationSet></Period>',
        '</MPD>',
      ].join(''),
    });
    const schedulerSpy = vi.spyOn(segmentScheduler, 'scheduleSegments');

    await runBrowserDashExportJob({
      candidate: candidate(),
      job: job(),
      manifest,
      fetchBytes: vi.fn().mockResolvedValue(new Uint8Array([1])),
      createObjectUrl: vi.fn().mockReturnValue('blob:dash'),
      revokeObjectUrl: vi.fn(),
      download: vi.fn().mockResolvedValue(93),
      concurrency: 5,
      maxConcurrentPerHost: 2,
      segmentTimeoutMs: 12_000,
    });

    expect(schedulerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 5,
        maxConcurrentPerHost: 2,
        segmentTimeoutMs: 12_000,
      }),
    );
    schedulerSpy.mockRestore();
  });

  test('rejects protected DASH before fetching unless explicitly allowed', async () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/protected.mpd',
      content: [
        '<MPD><Period><AdaptationSet contentType="video">',
        '<ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />',
        '<Representation id="v1"><BaseURL>video.mp4</BaseURL></Representation>',
        '</AdaptationSet></Period></MPD>',
      ].join(''),
    });
    const fetchBytes = vi.fn();

    await expect(
      runBrowserDashExportJob({
        candidate: candidate({
          status: 'protected',
          protection: { kind: 'drm', drmSystems: ['widevine'] },
        }),
        job: job(),
        manifest,
        fetchBytes,
        download: vi.fn(),
      }),
    ).rejects.toThrow('Protected DASH media cannot be exported by the browser runner.');

    expect(fetchBytes).not.toHaveBeenCalled();
  });
});
