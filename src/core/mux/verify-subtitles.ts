export interface FFprobeStream {
  codec_type?: string;
  codec_name?: string;
}

export interface FFprobeLike {
  streams?: FFprobeStream[];
}

export type SubtitleVerification =
  | { status: 'embedded'; codec?: string }
  | { status: 'missing' };

export function verifySubtitleTrack(probe: FFprobeLike): SubtitleVerification {
  const subtitle = probe.streams?.find((stream) => stream.codec_type === 'subtitle');

  if (!subtitle) {
    return { status: 'missing' };
  }

  return subtitle.codec_name
    ? { status: 'embedded', codec: subtitle.codec_name }
    : { status: 'embedded' };
}
