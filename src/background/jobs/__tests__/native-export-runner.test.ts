import { describe, expect, test, vi } from 'vitest';
import type { DownloadJob, MediaCandidate } from '@/video_downloader_types_skeleton';
import { createJobStore } from '../job-store';
import { runNativeExportJob } from '../native-export-runner';
import type { NativeFfmpegClient } from '@/src/native/native-ffmpeg-client';

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
  test('maps direct trimmed media to native export payload and updates progress', async () => {
    const client = nativeClient();
    const jobStore = createJobStore(() => 100);
    const queued = jobStore.create(candidate(), { mode: 'best', trim: { startSec: 1, endSec: 3 }, outputKind: 'mp4' });

    const output = await runNativeExportJob({
      candidate: candidate(),
      job: queued,
      nativeClient: client,
      jobStore,
    });

    expect(client.exportMedia).toHaveBeenCalledWith({
      jobId: queued.id,
      inputUrl: 'https://cdn.example.com/video.mp4',
      protocol: 'direct',
      outputName: 'Clear video.mp4',
      outputKind: 'mp4',
      trim: { startSec: 1, endSec: 3 },
    });
    expect(output).toEqual({
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
      outputUrl: 'C:\\Users\\tester\\AppData\\Local\\VideoDownloaderUnshackle\\outputs\\clip.mp4',
      sizeBytes: 1200,
    });
    expect(jobStore.get(queued.id)).toMatchObject({ phase: 'exporting', progressPct: 15 });
  });

  test('maps HLS and DASH candidates to manifest URL native exports', async () => {
    const client = nativeClient();

    await runNativeExportJob({
      candidate: candidate({ protocol: 'hls', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/master.m3u8' }),
      job: job({ id: 'job-hls', selection: { mode: 'best', outputKind: 'webm' } }),
      nativeClient: client,
    });
    await runNativeExportJob({
      candidate: candidate({ protocol: 'dash', sourceUrl: undefined, manifestUrl: 'https://cdn.example.com/manifest.mpd' }),
      job: job({ id: 'job-dash', selection: { mode: 'best', outputKind: 'audio-only' } }),
      nativeClient: client,
    });

    expect(client.exportMedia).toHaveBeenNthCalledWith(1, expect.objectContaining({
      jobId: 'job-hls',
      inputUrl: 'https://cdn.example.com/master.m3u8',
      protocol: 'hls',
      outputKind: 'webm',
    }));
    expect(client.exportMedia).toHaveBeenNthCalledWith(2, expect.objectContaining({
      jobId: 'job-dash',
      inputUrl: 'https://cdn.example.com/manifest.mpd',
      protocol: 'dash',
      outputKind: 'audio-only',
    }));
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
});
