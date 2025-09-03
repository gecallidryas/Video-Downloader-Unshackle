export type CodecContainer = 'mp4' | 'webm' | 'ts' | 'unknown';

export interface CodecInfo {
  video?: string;
  audio?: string;
  container: CodecContainer;
}

const VIDEO_TOKENS: Array<{ token: string; label: string }> = [
  { token: 'avc1', label: 'H.264' },
  { token: 'avc3', label: 'H.264' },
  { token: 'hvc1', label: 'HEVC' },
  { token: 'hev1', label: 'HEVC' },
  { token: 'vp09', label: 'VP9' },
  { token: 'vp08', label: 'VP8' },
  { token: 'av01', label: 'AV1' },
];

const AUDIO_TOKENS: Array<{ token: string; label: string }> = [
  { token: 'mp4a', label: 'AAC' },
  { token: 'Opus', label: 'Opus' },
  { token: 'opus', label: 'Opus' },
  { token: 'ac-3', label: 'AC-3' },
  { token: 'ec-3', label: 'E-AC-3' },
  { token: 'flac', label: 'FLAC' },
  { token: 'Vorb', label: 'Vorbis' },
];

const MIN_SNIFF_BYTES = 16;

function indexOfAscii(buf: Uint8Array, needle: string): number {
  const len = needle.length;
  const limit = buf.length - len;
  outer: for (let i = 0; i <= limit; i += 1) {
    for (let j = 0; j < len; j += 1) {
      if (buf[i + j] !== needle.charCodeAt(j)) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

function detectContainer(buf: Uint8Array): CodecContainer {
  if (buf.length >= 8 && indexOfAscii(buf.subarray(0, 16), 'ftyp') >= 0) {
    if (indexOfAscii(buf.subarray(0, 32), 'webm') >= 0) {
      return 'webm';
    }
    return 'mp4';
  }
  // EBML/Matroska header 0x1A 0x45 0xDF 0xA3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'webm';
  }
  // MPEG-TS: 0x47 sync byte at start and 188 bytes later
  if (buf[0] === 0x47 && buf.length >= 189 && buf[188] === 0x47) {
    return 'ts';
  }
  return 'unknown';
}

export function sniffCodecs(buf: Uint8Array): CodecInfo | null {
  if (!buf || buf.length < MIN_SNIFF_BYTES) {
    return null;
  }

  const container = detectContainer(buf);
  const info: CodecInfo = { container };

  for (const { token, label } of VIDEO_TOKENS) {
    if (indexOfAscii(buf, token) >= 0) {
      info.video = label;
      break;
    }
  }

  for (const { token, label } of AUDIO_TOKENS) {
    if (indexOfAscii(buf, token) >= 0) {
      info.audio = label;
      break;
    }
  }

  if (container === 'unknown' && !info.video && !info.audio) {
    return null;
  }

  return info;
}

export function formatCodecLabel(info: CodecInfo): string {
  if (info.video && info.audio) {
    return `${info.video} / ${info.audio}`;
  }
  if (info.video) {
    return info.video;
  }
  if (info.audio) {
    return info.audio;
  }
  return 'Unknown';
}

type CanPlayResult = '' | 'maybe' | 'probably';

const CODEC_MIME_HINTS: Record<string, string> = {
  'H.264': 'video/mp4; codecs="avc1.42E01E"',
  HEVC: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  VP9: 'video/webm; codecs="vp9"',
  VP8: 'video/webm; codecs="vp8"',
  AV1: 'video/mp4; codecs="av01.0.05M.08"',
  AAC: 'audio/mp4; codecs="mp4a.40.2"',
  Opus: 'audio/webm; codecs="opus"',
};

export function isCodecSupported(
  info: CodecInfo,
  canPlayType: (mime: string) => CanPlayResult,
): boolean {
  const labels = [info.video, info.audio].filter((value): value is string => Boolean(value));
  if (labels.length === 0) {
    return true;
  }
  return labels.every((label) => {
    const mime = CODEC_MIME_HINTS[label];
    if (!mime) {
      return true;
    }
    const result = canPlayType(mime);
    return result !== '';
  });
}
