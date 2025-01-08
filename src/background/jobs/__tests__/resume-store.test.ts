import { describe, expect, test } from 'vitest';
import type {
  HlsManifest,
  ResumeSnapshot,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
import { createMemoryBinaryStore } from '@/src/core/storage/opfs-store';
import { createResumeStore } from '../resume-store';

function buildManifest(): HlsManifest {
  return {
    id: 'manifest-1',
    protocol: 'hls',
    sourceUrl: 'https://cdn.example.com/master.m3u8',
    isLive: false,
    protection: { kind: 'none' },
    variants: [
      {
        id: 'variant-720',
        url: 'https://cdn.example.com/720/prog.m3u8',
        height: 720,
        isDefault: true,
      },
    ],
    audioTracks: [],
    subtitleTracks: [],
  };
}

function buildPlan(): SegmentPlan {
  return {
    jobId: 'job-1',
    candidateId: 'candidate-1',
    protocol: 'hls',
    variantId: 'variant-720',
    selectedAudioTrackIds: [],
    selectedSubtitleTrackIds: [],
    segments: [
      {
        id: 'segment-1',
        index: 0,
        url: 'https://cdn.example.com/720/segment-1.ts',
        durationSec: 6,
      },
    ],
  };
}

function buildSnapshot(
  overrides: Partial<ResumeSnapshot> = {},
): ResumeSnapshot {
  return {
    jobId: 'job-1',
    manifest: buildManifest(),
    plan: buildPlan(),
    downloadedSegmentIds: ['segment-1'],
    failedSegmentIds: [],
    tempOutputPath: 'tmp/job-1.bin',
    updatedAt: 700,
    ...overrides,
  };
}

describe('createResumeStore', () => {
  test('stores and loads resume snapshots for segmented jobs', async () => {
    const binaryStore = createMemoryBinaryStore();
    const resumeStore = createResumeStore(binaryStore);
    const snapshot = buildSnapshot();

    await resumeStore.save(snapshot);

    expect(await resumeStore.load('job-1')).toEqual(snapshot);
  });

  test('returns undefined for missing resume snapshots', async () => {
    const resumeStore = createResumeStore(createMemoryBinaryStore());

    expect(await resumeStore.load('missing-job')).toBeUndefined();
  });
});
