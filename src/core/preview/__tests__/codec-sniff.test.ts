import { describe, expect, test } from 'vitest';
import { sniffCodecs, formatCodecLabel, isCodecSupported } from '../codec-sniff';

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function ascii(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

function buildFtypIsom(): Uint8Array {
  const size = [0x00, 0x00, 0x00, 0x18];
  const type = ascii('ftyp');
  const major = ascii('isom');
  const minor = [0x00, 0x00, 0x02, 0x00];
  const compat = [...ascii('isom'), ...ascii('avc1')];
  return bytes(...size, ...type, ...major, ...minor, ...compat);
}

function buildMoovWithAvc1Mp4a(): Uint8Array {
  // Minimal moov containing avc1 + mp4a brand strings; sniff is heuristic and scans for codec tokens.
  const header = [0x00, 0x00, 0x00, 0x40];
  const type = ascii('moov');
  const padding = new Array(8).fill(0x00);
  const avc = ascii('avc1');
  const morePad = new Array(16).fill(0x00);
  const mp4a = ascii('mp4a');
  const tail = new Array(20).fill(0x00);
  return bytes(...header, ...type, ...padding, ...avc, ...morePad, ...mp4a, ...tail);
}

describe('sniffCodecs', () => {
  test('returns null when buffer is too short', () => {
    expect(sniffCodecs(bytes(0x00))).toBeNull();
  });

  test('detects H.264 from avc1 token in MP4 init segment', () => {
    const buf = new Uint8Array([...buildFtypIsom(), ...buildMoovWithAvc1Mp4a()]);
    const result = sniffCodecs(buf);
    expect(result).not.toBeNull();
    expect(result?.video).toBe('H.264');
    expect(result?.audio).toBe('AAC');
    expect(result?.container).toBe('mp4');
  });

  test('detects HEVC from hvc1', () => {
    const data = new Uint8Array([
      ...ascii('ftypisom'),
      0x00, 0x00, 0x00, 0x00,
      ...ascii('hvc1'),
    ]);
    expect(sniffCodecs(data)?.video).toBe('HEVC');
  });

  test('detects VP9 + Opus', () => {
    const data = new Uint8Array([
      ...ascii('ftypwebm'),
      0x00, 0x00, 0x00, 0x00,
      ...ascii('vp09'),
      0x00, 0x00, 0x00, 0x00,
      ...ascii('Opus'),
    ]);
    const result = sniffCodecs(data);
    expect(result?.video).toBe('VP9');
    expect(result?.audio).toBe('Opus');
  });

  test('detects AV1 from av01', () => {
    const data = new Uint8Array([
      ...ascii('ftypisom'),
      0x00, 0x00, 0x00, 0x00,
      ...ascii('av01'),
    ]);
    expect(sniffCodecs(data)?.video).toBe('AV1');
  });

  test('detects MPEG-TS PAT sync byte', () => {
    const ts = new Uint8Array(188 * 2);
    ts[0] = 0x47;
    ts[188] = 0x47;
    const result = sniffCodecs(ts);
    expect(result?.container).toBe('ts');
  });
});

describe('formatCodecLabel', () => {
  test('joins video + audio with slash', () => {
    expect(formatCodecLabel({ video: 'H.264', audio: 'AAC', container: 'mp4' })).toBe(
      'H.264 / AAC',
    );
  });

  test('omits audio if missing', () => {
    expect(formatCodecLabel({ video: 'VP9', container: 'webm' })).toBe('VP9');
  });

  test('returns Unknown when neither present', () => {
    expect(formatCodecLabel({ container: 'mp4' })).toBe('Unknown');
  });
});

describe('isCodecSupported', () => {
  test('flags HEVC unsupported on a stub canPlayType that returns empty', () => {
    const canPlayType = () => '' as const;
    expect(isCodecSupported({ video: 'HEVC', container: 'mp4' }, canPlayType)).toBe(false);
  });

  test('flags H.264 supported when canPlayType returns probably', () => {
    const canPlayType = () => 'probably' as const;
    expect(isCodecSupported({ video: 'H.264', container: 'mp4' }, canPlayType)).toBe(true);
  });

  test('returns true when codec info missing (cannot determine)', () => {
    const canPlayType = () => '' as const;
    expect(isCodecSupported({ container: 'mp4' }, canPlayType)).toBe(true);
  });
});
