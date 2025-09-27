export type OutputContainer = 'mp4' | 'mkv' | 'webm' | 'mp3';

export interface ResolveOutputContainerInput {
  hasSubtitles: boolean;
  override?: OutputContainer | 'auto';
}

export function resolveOutputContainer(
  input: ResolveOutputContainerInput,
): OutputContainer {
  if (input.override && input.override !== 'auto') {
    return input.override;
  }

  return input.hasSubtitles ? 'mkv' : 'mp4';
}
