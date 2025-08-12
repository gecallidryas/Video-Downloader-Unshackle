export type PlayerSourceName = 'jwplayer' | 'videojs' | 'soundmanager';

export interface PlayerSource {
  source: PlayerSourceName;
  url: string;
  mimeType?: string;
  title?: string;
}

export interface ExtractPlayerSourcesOptions {
  advancedMode?: boolean;
}

type UnknownRecord = Record<string, unknown>;

const mediaUrlPattern =
  /^https?:\/\/[^\s"'`<>]+?\.(?:m3u8|m3u|mpd|mp4|m4v|webm|mkv|mov|ogv|flv|mp3|m4a|aac|flac|ogg|opus|wav|oga|weba)(?:\?[^\s"'`<>]*)?$/i;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function callUnknown(value: unknown): unknown {
  return typeof value === 'function' ? value() : undefined;
}

function getString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];

  return typeof value === 'string' ? value : undefined;
}

function collectFromValue(
  value: unknown,
  source: PlayerSourceName,
  output: PlayerSource[],
  inheritedTitle?: string,
): void {
  if (typeof value === 'string') {
    if (mediaUrlPattern.test(value)) {
      output.push({ source, url: value, title: inheritedTitle });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectFromValue(entry, source, output, inheritedTitle);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const title = getString(value, 'title') ?? inheritedTitle;
  const url = getString(value, 'file') ?? getString(value, 'src') ?? getString(value, 'url');

  if (url && mediaUrlPattern.test(url)) {
    output.push({
      source,
      url,
      mimeType: getString(value, 'type'),
      title,
    });
  }

  for (const entry of Object.values(value)) {
    collectFromValue(entry, source, output, title);
  }
}

function extractJwPlayer(windowRef: UnknownRecord): PlayerSource[] {
  const jwplayer = windowRef.jwplayer;
  const player = callUnknown(jwplayer);
  const config = isRecord(player) ? callUnknown(player.getConfig) : undefined;
  const sources: PlayerSource[] = [];

  collectFromValue(config ?? player, 'jwplayer', sources);

  return sources;
}

function extractVideoJs(windowRef: UnknownRecord): PlayerSource[] {
  const videojs = windowRef.videojs;
  const players = isRecord(videojs) ? callUnknown(videojs.getPlayers) : undefined;
  const sources: PlayerSource[] = [];

  if (!isRecord(players)) {
    collectFromValue(videojs, 'videojs', sources);
    return sources;
  }

  for (const player of Object.values(players)) {
    if (isRecord(player)) {
      collectFromValue(callUnknown(player.currentSources), 'videojs', sources);
      collectFromValue(callUnknown(player.currentSource), 'videojs', sources);
      collectFromValue(player.options_, 'videojs', sources);
    }
  }

  return sources;
}

function extractSoundManager(windowRef: UnknownRecord): PlayerSource[] {
  const soundManager = windowRef.soundManager;
  const sources: PlayerSource[] = [];

  if (!isRecord(soundManager)) {
    return sources;
  }

  const ids = Array.isArray(soundManager.soundIDs) ? soundManager.soundIDs : [];
  for (const id of ids) {
    if (typeof id === 'string' && typeof soundManager.getSoundById === 'function') {
      collectFromValue(soundManager.getSoundById(id), 'soundmanager', sources);
    }
  }

  collectFromValue(soundManager.sounds, 'soundmanager', sources);
  collectFromValue(soundManager._sounds, 'soundmanager', sources);

  return sources;
}

export function extractPlayerSources(
  windowRef: unknown = typeof window !== 'undefined' ? window : undefined,
  options: ExtractPlayerSourcesOptions = {},
): PlayerSource[] {
  if (!options.advancedMode || !isRecord(windowRef)) {
    return [];
  }

  try {
    const seen = new Set<string>();
    const sources = [
      ...extractJwPlayer(windowRef),
      ...extractVideoJs(windowRef),
      ...extractSoundManager(windowRef),
    ];

    return sources.filter((source) => {
      const key = `${source.source}:${source.url}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}
