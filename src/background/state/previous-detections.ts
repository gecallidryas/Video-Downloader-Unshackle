import type { MediaCandidate } from '@/video_downloader_types_skeleton';

export const PREVIOUS_DETECTIONS_KEY = 'unshackle:previousDetections';
export const PREVIOUS_DETECTIONS_MAX_ENTRIES = 200;

export interface PreviousDetectionsStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
}

export interface SaveDetectionsParams {
  tabId: number;
  incognito?: boolean;
  candidates: MediaCandidate[];
  storage?: PreviousDetectionsStorage;
  now?: () => number;
}

function defaultStorage(): PreviousDetectionsStorage | undefined {
  return globalThis.chrome?.storage?.local as
    | PreviousDetectionsStorage
    | undefined;
}

export async function saveDetectionsOnTabClose({
  tabId,
  incognito = false,
  candidates,
  storage = defaultStorage(),
  now = Date.now,
}: SaveDetectionsParams): Promise<void> {
  if (incognito || !storage || candidates.length === 0) {
    return;
  }

  const stored = await storage.get(PREVIOUS_DETECTIONS_KEY);
  const existing = Array.isArray(stored[PREVIOUS_DETECTIONS_KEY])
    ? (stored[PREVIOUS_DETECTIONS_KEY] as MediaCandidate[])
    : [];

  const timestamp = now();
  const enriched = candidates.map((candidate) => ({
    ...candidate,
    tabId,
    updatedAt: candidate.updatedAt || timestamp,
  }));

  const merged = [...enriched, ...existing].slice(
    0,
    PREVIOUS_DETECTIONS_MAX_ENTRIES,
  );

  await storage.set({ [PREVIOUS_DETECTIONS_KEY]: merged });
}

export async function loadPreviousDetections(
  storage: PreviousDetectionsStorage | undefined = defaultStorage(),
): Promise<MediaCandidate[]> {
  if (!storage) {
    return [];
  }

  const stored = await storage.get(PREVIOUS_DETECTIONS_KEY);
  const raw = stored[PREVIOUS_DETECTIONS_KEY];

  return Array.isArray(raw) ? (raw as MediaCandidate[]) : [];
}
