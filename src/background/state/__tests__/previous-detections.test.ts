import { describe, expect, test, vi } from 'vitest';
import { SETTINGS_STORAGE_KEY } from '@/src/background/settings/settings-store';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  PREVIOUS_DETECTIONS_KEY,
  saveDetectionsOnTabClose,
} from '../previous-detections';

function candidate(id: string): MediaCandidate {
  return {
    id,
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    pageTitle: 'Example',
    origin: 'https://example.com',
    displayName: id,
    sourceUrl: `https://cdn.example.com/${id}.mp4`,
    mimeType: 'video/mp4',
    protection: { kind: 'none' },
    variants: [],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('previous detections', () => {
  test('uses previousSessionLimit setting when saving tab detections', async () => {
    const values: Record<string, unknown> = {
      [SETTINGS_STORAGE_KEY]: { previousSessionLimit: 2 },
      [PREVIOUS_DETECTIONS_KEY]: [candidate('old-1'), candidate('old-2')],
    };
    const storage = {
      get: vi.fn(async (key: string) => ({ [key]: values[key] })),
      set: vi.fn(async (patch: Record<string, unknown>) => {
        Object.assign(values, patch);
      }),
    };

    await saveDetectionsOnTabClose({
      tabId: 9,
      candidates: [candidate('new-1'), candidate('new-2'), candidate('new-3')],
      storage,
      now: () => 500,
    });

    expect(values[PREVIOUS_DETECTIONS_KEY]).toMatchObject([
      { id: 'new-1' },
      { id: 'new-2' },
    ]);
  });
});
