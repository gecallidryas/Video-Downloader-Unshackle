import { describe, expect, test, vi } from 'vitest';
import type {
  DownloadJob,
  MediaCandidate,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
import * as segmentScheduler from '@/src/core/download/segment-scheduler';
import * as runDashJobModule from '@/src/core/dash/run-dash-job';
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
      fileName: 'dash-movie.mp4',
      mimeType: 'video/mp4',
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
      filename: 'dash-movie.mp4',
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

  test('writes DASH browser exports directly to disk when a writer is supplied', async () => {
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
    const writeFile = vi.fn(async () => undefined);
    const download = vi.fn();

    await expect(
      runBrowserDashExportJob({
        candidate: candidate(),
        job: job(),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(new Uint8Array([9])),
        writeFile,
        download,
      }),
    ).resolves.toMatchObject({
      fileName: 'dash-movie.bin',
      outputUrl: 'file-system-access://dash-movie.bin',
      notes: ['Saved directly to the selected output folder.'],
    });

    expect(writeFile).toHaveBeenCalledWith('dash-movie.bin', new Uint8Array([9]));
    expect(download).not.toHaveBeenCalled();
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

  test('refuses multi-track DASH plans instead of emitting an undemuxable bin', async () => {
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
    const multiTrackPlan: SegmentPlan = {
      jobId: 'job-dash-1',
      candidateId: 'candidate-dash-1',
      protocol: 'dash',
      variantId: 'v1',
      selectedAudioTrackIds: [],
      selectedSubtitleTrackIds: [],
      segments: [
        { id: 'v-init', index: 0, url: 'https://cdn.example.com/v/init.mp4', initSegment: true, trackType: 'video' },
        { id: 'v-1', index: 1, url: 'https://cdn.example.com/v/1.m4s', trackType: 'video' },
        { id: 'a-init', index: 2, url: 'https://cdn.example.com/a/init.mp4', initSegment: true, trackType: 'audio' },
        { id: 'a-1', index: 3, url: 'https://cdn.example.com/a/1.m4s', trackType: 'audio' },
      ],
    };
    const runDashJobSpy = vi
      .spyOn(runDashJobModule, 'runDashJob')
      .mockImplementation(async (jobInput) =>
        jobInput.writeOutput(multiTrackPlan, [new Uint8Array([1]), new Uint8Array([2])]),
      );
    const download = vi.fn();

    await expect(
      runBrowserDashExportJob({
        candidate: candidate(),
        job: job(),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(new Uint8Array([9])),
        download,
      }),
    ).rejects.toThrow(/cannot mux separate audio and video tracks/i);

    expect(download).not.toHaveBeenCalled();
    runDashJobSpy.mockRestore();
  });

  test('refuses a manifest with separate audio + video AdaptationSets before fetching', async () => {
    const manifest = parseMpd({
      manifestUrl: 'https://cdn.example.com/dash/manifest.mpd',
      content: [
        '<MPD mediaPresentationDuration="PT8S">',
        '<Period>',
        '<AdaptationSet contentType="video"><Representation id="v1">',
        '<SegmentTemplate duration="4" startNumber="1" initialization="v/init.mp4" media="v/seg-$Number$.m4s" />',
        '</Representation></AdaptationSet>',
        '<AdaptationSet contentType="audio"><Representation id="a1">',
        '<SegmentTemplate duration="4" startNumber="1" initialization="a/init.mp4" media="a/seg-$Number$.m4s" />',
        '</Representation></AdaptationSet>',
        '</Period></MPD>',
      ].join(''),
    });
    const fetchBytes = vi.fn();
    const download = vi.fn();

    await expect(
      runBrowserDashExportJob({
        candidate: candidate(),
        job: job(),
        manifest,
        fetchBytes,
        download,
      }),
    ).rejects.toThrow(/cannot mux separate audio and video tracks/i);

    expect(fetchBytes).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  test('emits a single-track plan through the normal raw export path', async () => {
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
    const singleTrackPlan: SegmentPlan = {
      jobId: 'job-dash-1',
      candidateId: 'candidate-dash-1',
      protocol: 'dash',
      variantId: 'v1',
      selectedAudioTrackIds: [],
      selectedSubtitleTrackIds: [],
      segments: [
        { id: 'v-init', index: 0, url: 'https://cdn.example.com/v/init.mp4', initSegment: true, trackType: 'video' },
        { id: 'v-1', index: 1, url: 'https://cdn.example.com/v/seg-1.m4s', trackType: 'video' },
      ],
    };
    const runDashJobSpy = vi
      .spyOn(runDashJobModule, 'runDashJob')
      .mockImplementation(async (jobInput) =>
        jobInput.writeOutput(singleTrackPlan, [new Uint8Array([1]), new Uint8Array([2])]),
      );

    await expect(
      runBrowserDashExportJob({
        candidate: candidate(),
        job: job(),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(new Uint8Array([9])),
        createObjectUrl: vi.fn().mockReturnValue('blob:single-track'),
        revokeObjectUrl: vi.fn(),
        download: vi.fn().mockResolvedValue(94),
      }),
    ).resolves.toMatchObject({
      fileName: 'dash-movie.mp4',
      mimeType: 'video/mp4',
    });

    runDashJobSpy.mockRestore();
  });

  test('refuses oversize in-memory single-track DASH instead of OOMing the worker', async () => {
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
    const download = vi.fn();

    await expect(
      runBrowserDashExportJob({
        candidate: candidate(),
        job: job(),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(new Uint8Array(64)),
        createObjectUrl: vi.fn(),
        revokeObjectUrl: vi.fn(),
        download,
        memoryCeilingBytes: 16,
      }),
    ).rejects.toThrow(/safe in-memory limit/i);

    expect(download).not.toHaveBeenCalled();
  });

  test('writes an oversize DASH download to disk past the memory ceiling', async () => {
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
    const writeFile = vi.fn(async () => undefined);

    await expect(
      runBrowserDashExportJob({
        candidate: candidate(),
        job: job(),
        manifest,
        fetchBytes: vi.fn().mockResolvedValue(new Uint8Array(64)),
        writeFile,
        download: vi.fn(),
        memoryCeilingBytes: 16,
      }),
    ).resolves.toMatchObject({
      outputUrl: 'file-system-access://dash-movie.bin',
    });

    expect(writeFile).toHaveBeenCalled();
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
