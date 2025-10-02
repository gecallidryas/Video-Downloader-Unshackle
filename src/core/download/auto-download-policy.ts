export interface AutoDownloadCandidate {
  url: string;
  sizeBytes?: number;
  mediaKind: string;
  protected: boolean;
}

export interface AutoDownloadSettings {
  autoDownloadEnabled: boolean;
  autoDownloadMinSize: number;
  autoDownloadBlacklist: string[];
  advancedMode: boolean;
}

function globMatches(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  return new RegExp(`^${escaped}$`, 'i').test(value);
}

export function isAutoDownloadEligible(
  candidate: AutoDownloadCandidate,
  settings: AutoDownloadSettings,
): boolean {
  if (!settings.autoDownloadEnabled || !settings.advancedMode) {
    return false;
  }

  if (candidate.protected) {
    return false;
  }

  if (candidate.mediaKind !== 'direct_media') {
    return false;
  }

  if ((candidate.sizeBytes ?? 0) < settings.autoDownloadMinSize) {
    return false;
  }

  for (const pattern of settings.autoDownloadBlacklist) {
    if (pattern && globMatches(pattern, candidate.url)) {
      return false;
    }
  }

  return true;
}
