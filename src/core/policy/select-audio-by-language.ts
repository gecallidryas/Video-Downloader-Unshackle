export interface AudioTrackLike {
  id: string;
  language?: string;
}

function primarySubtag(language: string): string {
  return language.split('-')[0]?.toLowerCase() ?? '';
}

export function selectAudioByLanguage<T extends AudioTrackLike>(
  tracks: T[],
  preference: string,
): T | null {
  if (tracks.length === 0 || !preference) return null;
  const target = preference.toLowerCase();
  const targetBase = primarySubtag(preference);

  for (const track of tracks) {
    if (track.language && track.language.toLowerCase() === target) {
      return track;
    }
  }

  if (!targetBase) return null;

  for (const track of tracks) {
    if (track.language && primarySubtag(track.language) === targetBase) {
      return track;
    }
  }

  return null;
}
