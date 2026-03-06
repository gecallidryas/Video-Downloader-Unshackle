import { create } from 'zustand';
import type {
  DownloadJob,
  DownloadSelection,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import type { RuntimeClient } from '@/src/lib/runtime/client';
import { toDetectedMedia } from '@/src/shared/adapters/media-card';
import type { DetectedMedia } from '@/src/types/media';
import type { PanelSurfaceState } from '@/src/types/ui-state';

export interface PanelStoreState {
  surfaceState: PanelSurfaceState;
  candidates: MediaCandidate[];
  mediaItems: DetectedMedia[];
  queueJobs: DownloadJob[];
  downloadingIds: Set<string>;
  errorMessage: string | null;
  loadCandidates: (runtimeClient: RuntimeClient, tabId: number) => Promise<void>;
  setCandidates: (candidates: MediaCandidate[]) => void;
  removeItem: (id: string) => void;
  setQuality: (id: string, quality: string) => void;
  setAudioTracks: (id: string, trackIds: string[]) => void;
  setSubtitleTracks: (id: string, trackIds: string[]) => void;
  setSubtitleOutput: (
    id: string,
    output: NonNullable<DownloadSelection['subtitleOutput']>,
  ) => void;
  setTrim: (id: string, trim: DetectedMedia['trim']) => void;
  getDownloadSelection: (id: string) => DownloadSelection | undefined;
  upsertQueueJob: (job: DownloadJob) => void;
  downloadItem: (id: string) => void;
  setSurfaceState: (surfaceState: PanelSurfaceState) => void;
  setErrorMessage: (errorMessage: string | null) => void;
}

function mergeCandidateMediaItems(
  candidates: MediaCandidate[],
  currentItems: DetectedMedia[],
): DetectedMedia[] {
  const currentById = new Map(currentItems.map((item) => [item.id, item]));

  return candidates.map((candidate) => {
    const next = toDetectedMedia(candidate);
    const current = currentById.get(candidate.id);

    if (!current) {
      return next;
    }

    return {
      ...next,
      selectedQuality: current.selectedQuality,
      selectedAudioTrackIds: current.selectedAudioTrackIds,
      selectedSubtitleTrackIds: current.selectedSubtitleTrackIds,
      selectedSubtitleOutput: current.selectedSubtitleOutput,
      trim: current.trim,
      previewAssetUrl: current.previewAssetUrl,
      previewLoading: current.previewLoading,
      thumbnailUrl: current.thumbnailUrl ?? next.thumbnailUrl,
    };
  });
}

export const usePanelStore = create<PanelStoreState>((set, get) => ({
  surfaceState: 'detecting',
  candidates: [],
  mediaItems: [],
  queueJobs: [],
  downloadingIds: new Set<string>(),
  errorMessage: null,
  loadCandidates: async (runtimeClient, tabId) => {
    set({ surfaceState: 'detecting', errorMessage: null });

    try {
      const candidates = await runtimeClient.getCandidates(tabId);

      set({
        candidates,
        mediaItems: candidates.map(toDetectedMedia),
        surfaceState: candidates.length > 0 ? 'results' : 'empty',
      });
    } catch (error) {
      set({
        candidates: [],
        mediaItems: [],
        surfaceState: 'error',
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Something went wrong while inspecting this page',
      });
    }
  },
  setCandidates: (candidates) =>
    set((state) => ({
      candidates,
      mediaItems: mergeCandidateMediaItems(candidates, state.mediaItems),
      surfaceState: candidates.length > 0 ? 'results' : 'empty',
    })),
  removeItem: (id) =>
    set((state) => {
      const mediaItems = state.mediaItems.filter((item) => item.id !== id);
      const candidates = state.candidates.filter((candidate) => candidate.id !== id);
      const queueJobs = state.queueJobs.filter((job) => job.candidateId !== id);

      return {
        candidates,
        mediaItems,
        queueJobs,
        surfaceState: mediaItems.length === 0 ? 'empty' : 'results',
      };
    }),
  setQuality: (id, quality) =>
    set((state) => ({
      mediaItems: state.mediaItems.map((item) =>
        item.id === id ? { ...item, selectedQuality: quality } : item,
      ),
    })),
  setAudioTracks: (id, trackIds) =>
    set((state) => ({
      mediaItems: state.mediaItems.map((item) =>
        item.id === id ? { ...item, selectedAudioTrackIds: trackIds } : item,
      ),
    })),
  setSubtitleTracks: (id, trackIds) =>
    set((state) => ({
      mediaItems: state.mediaItems.map((item) =>
        item.id === id
          ? {
              ...item,
              selectedSubtitleTrackIds: trackIds,
              selectedSubtitleOutput:
                trackIds.length > 0 ? item.selectedSubtitleOutput ?? 'embed' : undefined,
            }
          : item,
      ),
    })),
  setSubtitleOutput: (id, output) =>
    set((state) => ({
      mediaItems: state.mediaItems.map((item) =>
        item.id === id ? { ...item, selectedSubtitleOutput: output } : item,
      ),
    })),
  setTrim: (id, trim) =>
    set((state) => ({
      mediaItems: state.mediaItems.map((item) =>
        item.id === id ? { ...item, trim } : item,
      ),
  })),
  getDownloadSelection: (id) => {
    const item = get().mediaItems.find((media) => media.id === id);

    if (!item) {
      return undefined;
    }

    return {
      mode: 'custom',
      ...(item.selectedQuality ? { variantId: item.selectedQuality } : {}),
      ...(item.selectedAudioTrackIds?.length
        ? { audioTrackIds: item.selectedAudioTrackIds }
        : {}),
      ...(item.selectedSubtitleTrackIds?.length
        ? { subtitleTrackIds: item.selectedSubtitleTrackIds }
        : {}),
      ...(item.selectedSubtitleTrackIds?.length && item.selectedSubtitleOutput
        ? { subtitleOutput: item.selectedSubtitleOutput }
        : {}),
      ...(item.trim ? { trim: item.trim } : {}),
    };
  },
  upsertQueueJob: (job) =>
    set((state) => {
      const existing = state.queueJobs.some((queuedJob) => queuedJob.id === job.id);

      return {
        queueJobs: existing
          ? state.queueJobs.map((queuedJob) =>
              queuedJob.id === job.id ? job : queuedJob,
            )
          : [...state.queueJobs, job],
      };
    }),
  downloadItem: (id) =>
    set((state) => ({
      downloadingIds: new Set([...state.downloadingIds, id]),
    })),
  setSurfaceState: (surfaceState) => set({ surfaceState }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
}));
