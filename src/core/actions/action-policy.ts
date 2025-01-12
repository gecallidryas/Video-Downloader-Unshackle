import type {
  DownloadSelection,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';

export const SUPPORTED_DOWNLOAD_ACTIONS = [
  'download',
  'download_as',
  'download_audio',
  'copy',
  'record_live',
] as const;

export type DownloadAction = (typeof SUPPORTED_DOWNLOAD_ACTIONS)[number];

export interface DownloadActionSettings {
  defaultAction?: string;
  defaultActionPerHost?: Record<string, string>;
}

export interface BuildDownloadIntentInput {
  action?: string;
  settings?: DownloadActionSettings;
  selection?: DownloadSelection;
}

export interface DownloadIntent {
  action: DownloadAction;
  shouldQueue: boolean;
  requiresProtectionCheck: true;
  selection: DownloadSelection;
  saveAs?: boolean;
  liveRecording?: boolean;
  copyUrl?: string;
}

const DEFAULT_ACTION: DownloadAction = 'download';

function normalizeHostname(value: string | undefined): string {
  const host = String(value ?? '').trim().toLowerCase();

  return host.startsWith('www.') ? host.slice(4) : host;
}

function hostFromUrl(url: string | undefined): string {
  if (!url) {
    return '';
  }

  try {
    return normalizeHostname(new URL(url).hostname);
  } catch {
    return '';
  }
}

function isDownloadAction(value: string): value is DownloadAction {
  return SUPPORTED_DOWNLOAD_ACTIONS.includes(value as DownloadAction);
}

function normalizeAction(action: string | undefined, fallback = DEFAULT_ACTION): DownloadAction {
  const normalized = String(action ?? '').trim().toLowerCase();

  if (isDownloadAction(normalized)) {
    return normalized;
  }

  return isDownloadAction(fallback) ? fallback : DEFAULT_ACTION;
}

function candidateHost(candidate: MediaCandidate): string {
  for (const url of [
    candidate.pageUrl,
    candidate.sourceUrl,
    candidate.manifestUrl,
    candidate.evidence[0]?.initiatorUrl,
    candidate.evidence[0]?.url,
  ]) {
    const host = hostFromUrl(url);

    if (host) {
      return host;
    }
  }

  return '';
}

function findHostAction(
  host: string,
  perHost: Record<string, string> | undefined,
): string | undefined {
  if (!host || !perHost) {
    return undefined;
  }

  for (const [rawPattern, action] of Object.entries(perHost)) {
    if (normalizeHostname(rawPattern) === host) {
      return action;
    }
  }

  for (const [rawPattern, action] of Object.entries(perHost)) {
    const pattern = rawPattern.trim().toLowerCase();

    if (pattern.startsWith('*.')) {
      const suffix = normalizeHostname(pattern.slice(2));

      if (host === suffix || host.endsWith(`.${suffix}`)) {
        return action;
      }
    } else if (pattern.startsWith('.')) {
      const suffix = normalizeHostname(pattern.slice(1));

      if (host.endsWith(`.${suffix}`)) {
        return action;
      }
    }
  }

  return undefined;
}

export function resolveDownloadAction(
  candidate: MediaCandidate,
  settings: DownloadActionSettings = {},
  explicitAction?: string,
): DownloadAction {
  if (explicitAction) {
    return normalizeAction(explicitAction);
  }

  const hostAction = findHostAction(
    candidateHost(candidate),
    settings.defaultActionPerHost,
  );

  return normalizeAction(hostAction ?? settings.defaultAction);
}

export function shouldQueueDownloadAction(action: string | undefined): boolean {
  return normalizeAction(action) !== 'copy';
}

export function buildDownloadIntent(
  candidate: MediaCandidate,
  input: BuildDownloadIntentInput = {},
): DownloadIntent {
  const action = resolveDownloadAction(candidate, input.settings, input.action);
  const selection: DownloadSelection = {
    mode: 'best',
    ...input.selection,
    action,
  };

  if (action === 'download_as') {
    selection.saveAs = true;
  }

  if (action === 'download_audio') {
    selection.outputKind = 'audio-only';
  }

  if (action === 'record_live') {
    selection.liveRecording = true;
  }

  return {
    action,
    shouldQueue: shouldQueueDownloadAction(action),
    requiresProtectionCheck: true,
    selection,
    ...(selection.saveAs ? { saveAs: true } : {}),
    ...(selection.liveRecording ? { liveRecording: true } : {}),
    ...(action === 'copy'
      ? { copyUrl: candidate.sourceUrl ?? candidate.manifestUrl ?? candidate.blobUrl }
      : {}),
  };
}
