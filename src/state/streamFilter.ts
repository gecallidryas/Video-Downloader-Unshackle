import type { DetectedMedia } from '@/src/types/media';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';

export type StreamFilterField = 'filename' | 'tabTitle' | 'type' | 'hostname';

export interface StreamFilterState {
  query: string;
  fields: StreamFilterField[];
}

export const STREAM_FILTER_FIELDS: readonly StreamFilterField[] = [
  'filename',
  'tabTitle',
  'type',
  'hostname',
];

export const STREAM_FILTER_FIELD_LABELS: Record<StreamFilterField, string> = {
  filename: 'Filename',
  tabTitle: 'Tab Title',
  type: 'Type',
  hostname: 'Hostname',
};

export function buildFilterContext(
  candidates: MediaCandidate[],
): Map<string, MediaCandidate> {
  return new Map(candidates.map((candidate) => [candidate.id, candidate]));
}

function safeHostname(url?: string): string {
  if (!url) {
    return '';
  }

  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function fieldText(
  field: StreamFilterField,
  media: DetectedMedia,
  candidate: MediaCandidate | undefined,
): string {
  switch (field) {
    case 'filename':
      return media.title ?? '';
    case 'tabTitle':
      return candidate?.pageTitle ?? '';
    case 'type':
      return (media.protocol ?? candidate?.protocol ?? media.format ?? '').toString();
    case 'hostname':
      return safeHostname(
        candidate?.sourceUrl ?? candidate?.manifestUrl ?? candidate?.pageUrl,
      );
    default:
      return '';
  }
}

export function matchesStream(
  media: DetectedMedia,
  candidate: MediaCandidate | undefined,
  state: StreamFilterState,
): boolean {
  const query = state.query.trim().toLowerCase();

  if (!query) {
    return true;
  }

  if (state.fields.length === 0) {
    return false;
  }

  return state.fields.some((field) =>
    fieldText(field, media, candidate).toLowerCase().includes(query),
  );
}

export function filterStreams(
  media: DetectedMedia[],
  candidates: MediaCandidate[],
  state: StreamFilterState,
): DetectedMedia[] {
  if (!state.query.trim()) {
    return media;
  }

  const context = buildFilterContext(candidates);
  return media.filter((item) => matchesStream(item, context.get(item.id), state));
}
