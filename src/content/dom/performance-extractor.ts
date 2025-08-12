export interface ExtractMediaResourcesOptions {
  advancedMode?: boolean;
}

const mediaUrlPattern =
  /\.(?:m3u8|m3u|mpd|f4m|ism\/manifest|mp4|m4v|webm|mkv|mov|ogv|flv|mp3|m4a|aac|flac|ogg|opus|wav|oga|weba|ts|m2ts|m2t|m4s|cmfv|cmfa|vtt|srt|ttml|dfxp)(?:[?#].*)?$/i;

function isMediaResourceUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const pathAndQuery = `${parsed.pathname}${parsed.search}`;

    return mediaUrlPattern.test(pathAndQuery);
  } catch {
    return mediaUrlPattern.test(value);
  }
}

function getResourceEntries(): PerformanceResourceTiming[] {
  try {
    return typeof performance !== 'undefined'
      ? (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      : [];
  } catch {
    return [];
  }
}

export function extractMediaResources(
  entries?: PerformanceResourceTiming[],
  options: ExtractMediaResourcesOptions = {},
): string[] {
  if (!options.advancedMode) {
    return [];
  }

  try {
    const seen = new Set<string>();
    const urls: string[] = [];

    for (const entry of entries ?? getResourceEntries()) {
      if (!entry.name || !isMediaResourceUrl(entry.name) || seen.has(entry.name)) {
        continue;
      }

      seen.add(entry.name);
      urls.push(entry.name);
    }

    return urls;
  } catch {
    return [];
  }
}
