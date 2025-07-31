export type NormalizedQualityLabel =
  | 'low'
  | 'standard'
  | 'high'
  | 'full'
  | 'quad'
  | 'ultra';

export type NormalizedContainer = 'mp4' | 'webm' | 'm3u8' | 'mpd' | 'unknown';

export function normalizeQualityLabel(height: number): NormalizedQualityLabel {
  if (height >= 2160) {
    return 'ultra';
  }

  if (height >= 1440) {
    return 'quad';
  }

  if (height >= 1080) {
    return 'full';
  }

  if (height >= 720) {
    return 'high';
  }

  if (height >= 480) {
    return 'standard';
  }

  return 'low';
}

export function normalizeContainerFromMime(mime: string): NormalizedContainer {
  const normalized = mime.split(';', 1)[0]?.trim().toLowerCase() ?? '';

  if (normalized === 'video/mp4' || normalized === 'audio/mp4') {
    return 'mp4';
  }

  if (normalized === 'video/webm' || normalized === 'audio/webm') {
    return 'webm';
  }

  if (
    normalized === 'application/vnd.apple.mpegurl' ||
    normalized === 'application/x-mpegurl' ||
    normalized === 'application/mpegurl' ||
    normalized === 'audio/mpegurl' ||
    normalized === 'audio/x-mpegurl'
  ) {
    return 'm3u8';
  }

  if (normalized === 'application/dash+xml' || normalized === 'video/vnd.mpeg.dash.mpd') {
    return 'mpd';
  }

  return 'unknown';
}
