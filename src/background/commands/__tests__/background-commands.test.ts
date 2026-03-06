import { describe, expect, test, vi } from 'vitest';
import { createDownloadQueue } from '@/src/background/jobs/download-queue';
import { createJobStore } from '@/src/background/jobs/job-store';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import { registerBackgroundCommandHandlers } from '../background-commands';

function buildCandidate(id: string): MediaCandidate {
  return {
    id,
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    origin: 'https://example.com',
    displayName: `${id}.mp4`,
    sourceUrl: `https://cdn.example.com/${id}.mp4`,
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

describe('registerBackgroundCommandHandlers', () => {
  test('wires pause-all, clear-completed, and open-side-panel commands', async () => {
    let listener: ((command: string) => void) | undefined;
    const jobStore = createJobStore(() => 1);
    const downloadQueue = createDownloadQueue({
      jobStore,
      executeJob: vi.fn(),
    });
    const activeJob = downloadQueue.enqueue(buildCandidate('active'));
    const completedJob = downloadQueue.enqueue(buildCandidate('complete'));
    jobStore.update(activeJob.id, { phase: 'fetching' });
    jobStore.update(completedJob.id, { phase: 'completed' });
    const open = vi.fn().mockResolvedValue(undefined);

    registerBackgroundCommandHandlers({
      commands: {
        onCommand: {
          addListener(callback) {
            listener = callback;
          },
        },
      },
      sidePanel: { open },
      windows: { getCurrent: vi.fn().mockResolvedValue({ id: 123 }) },
      jobStore,
      downloadQueue,
    });

    listener?.('pause-all');
    expect(jobStore.get(activeJob.id)?.phase).toBe('paused');

    listener?.('clear-completed');
    expect(jobStore.get(completedJob.id)).toBeUndefined();

    listener?.('open-side-panel');
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith({ windowId: 123 }));
  });
});
