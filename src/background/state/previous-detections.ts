import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
} from '@/src/background/settings/settings-store';

export const PREVIOUS_DETECTIONS_KEY = 'unshackle:previousDetections';

export interface PreviousDetectionsStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
}

export interface SaveDetectionsParams {
  tabId: number;
  incognito?: boolean;
  candidates: MediaCandidate[];
  storage?: PreviousDetectionsStorage;
  maxEntries?: number;
  now?: () => number;
}

function defaultStorage(): PreviousDetectionsStorage | undefined {
  return globalThis.chrome?.storage?.local as
    | PreviousDetectionsStorage
    | undefined;
}

function normalizeMaxEntries(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0
    ? Number(value)
    : DEFAULT_SETTINGS.previousSessionLimit;
}

function compactThumbnailUrl(url: string | undefined): string | undefined {
  if (!url?.startsWith('data:')) {
    return url;
  }

  return url.startsWith('data:image/webp;') ? url : undefined;
}

function compactCandidateForPreviousSession(candidate: MediaCandidate): MediaCandidate {
  const heroUrl = compactThumbnailUrl(candidate.thumbnails?.heroUrl);
  const rest = { ...candidate };
  delete rest.thumbnails;
  const thumbnails = heroUrl
    ? {
        heroUrl,
        ...(candidate.thumbnails?.width ? { width: candidate.thumbnails.width } : {}),
        ...(candidate.thumbnails?.height ? { height: candidate.thumbnails.height } : {}),
        ...(candidate.thumbnails?.generatedAt ? { generatedAt: candidate.thumbnails.generatedAt } : {}),
      }
    : undefined;

  return {
    ...rest,
    ...(thumbnails ? { thumbnails } : {}),
  };
}

async function readPreviousSessionLimit(
  storage: PreviousDetectionsStorage,
  maxEntries?: number,
): Promise<number> {
  if (maxEntries !== undefined) {
    return normalizeMaxEntries(maxEntries);
  }

  const stored = await storage.get(SETTINGS_STORAGE_KEY);
  const settings = stored[SETTINGS_STORAGE_KEY];
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    return DEFAULT_SETTINGS.previousSessionLimit;
  }

  return normalizeMaxEntries(
    (settings as Partial<typeof DEFAULT_SETTINGS>).previousSessionLimit,
  );
}

export async function saveDetectionsOnTabClose({
  tabId,
  incognito = false,
  candidates,
  storage = defaultStorage(),
  maxEntries,
  now = Date.now,
}: SaveDetectionsParams): Promise<void> {
  if (incognito || !storage || candidates.length === 0) {
    return;
  }

  const limit = await readPreviousSessionLimit(storage, maxEntries);
  const stored = await storage.get(PREVIOUS_DETECTIONS_KEY);
  const existing = Array.isArray(stored[PREVIOUS_DETECTIONS_KEY])
    ? (stored[PREVIOUS_DETECTIONS_KEY] as MediaCandidate[])
    : [];

  const timestamp = now();
  const enriched = candidates.map((candidate) => ({
    ...compactCandidateForPreviousSession(candidate),
    tabId,
    updatedAt: candidate.updatedAt || timestamp,
  }));

  const merged =
    limit > 0
      ? [...enriched, ...existing].slice(0, limit)
      : [...enriched, ...existing];

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
