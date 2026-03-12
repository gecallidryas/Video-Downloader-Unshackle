import { describe, expect, test } from 'vitest';
import { probeMpegTsSegment } from '../mpeg-ts-probe';

const TS_PACKET_SIZE = 188;

function packet(pid: number, payload: number[]): Uint8Array {
  const bytes = new Uint8Array(TS_PACKET_SIZE);

  bytes.fill(0xff);
  bytes[0] = 0x47;
  bytes[1] = 0x40 | ((pid >> 8) & 0x1f);
  bytes[2] = pid & 0xff;
  bytes[3] = 0x10;
  bytes[4] = 0x00;
  bytes.set(payload, 5);

  return bytes;
}

function validTsWithStreamTypes(streamTypes: number[]): Uint8Array {
  const pmtPid = 0x0100;
  const pat = packet(0x0000, [
    0x00, 0xb0, 0x0d,
    0x00, 0x01,
    0xc1,
    0x00,
    0x00,
    0x00, 0x01,
    0xe0 | ((pmtPid >> 8) & 0x1f), pmtPid & 0xff,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const streams = streamTypes.flatMap((streamType, index) => [
    streamType,
    0xe1,
    index,
    0xf0,
    0x00,
  ]);
  const sectionLength = 9 + streams.length + 4;
  const pmt = packet(pmtPid, [
    0x02, 0xb0 | ((sectionLength >> 8) & 0x0f), sectionLength & 0xff,
    0x00, 0x01,
    0xc1,
    0x00,
    0x00,
    0xe1, 0x00,
    0xf0, 0x00,
    ...streams,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const bytes = new Uint8Array(TS_PACKET_SIZE * 2);

  bytes.set(pat, 0);
  bytes.set(pmt, TS_PACKET_SIZE);

  return bytes;
}

describe('MPEG-TS segment probe', () => {
  test('accepts MPEG-TS bytes with H.264 and AAC PMT stream types for mux.js', () => {
    expect(probeMpegTsSegment(validTsWithStreamTypes([0x1b, 0x0f]))).toMatchObject({
      container: 'ts',
      hasPat: true,
      hasPmt: true,
      codecs: ['h264', 'aac'],
      streamTypes: [0x1b, 0x0f],
      muxJsCompatible: true,
    });
  });

  test('rejects MPEG-TS bytes with HEVC stream types for mux.js', () => {
    expect(probeMpegTsSegment(validTsWithStreamTypes([0x24]))).toMatchObject({
      container: 'ts',
      hasPat: true,
      hasPmt: true,
      codecs: ['hevc'],
      muxJsCompatible: false,
    });
  });

  test('identifies fMP4-looking bytes before extension-based routing can claim TS', () => {
    expect(probeMpegTsSegment(new Uint8Array([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70,
    ]))).toMatchObject({
      container: 'fmp4',
      muxJsCompatible: false,
    });
  });
});
