export type SubtitleFormat = 'vtt' | 'srt' | 'ttml' | 'dfxp' | 'ass' | 'ssa';

export interface DeriveSubtitleFilenameInput {
  videoFilename: string;
  language?: string;
  trackName?: string;
  format: SubtitleFormat;
}

function stripExtension(value: string): string {
  return value.replace(/\.[a-z0-9]{1,5}$/i, '');
}

function sanitizeBase(value: string): string {
  return value.replace(/[\x00-\x1F<>:"/\\|?*]+/g, '_');
}

function sanitizeTrackName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function resolveLanguageTag(input: DeriveSubtitleFilenameInput): string {
  if (input.language?.trim()) {
    return input.language.trim().toLowerCase();
  }

  if (input.trackName?.trim()) {
    return sanitizeTrackName(input.trackName) || 'und';
  }

  return 'und';
}

export function deriveSubtitleFilename(
  input: DeriveSubtitleFilenameInput,
): string {
  const rawBase = stripExtension(input.videoFilename || '').trim();
  const base = rawBase ? sanitizeBase(rawBase) : 'video';
  const lang = resolveLanguageTag(input);

  return `${base}.${lang}.${input.format}`;
}
