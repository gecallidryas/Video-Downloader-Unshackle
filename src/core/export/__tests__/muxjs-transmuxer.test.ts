import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { transmuxTsToMp4 } from '../muxjs-transmuxer';

function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(resolve(__dirname, '../../../../node_modules/mux.js/test/segments', name)),
  );
}

describe('mux.js TS transmuxer', () => {
  test('rejects non-TS inputs with a clear error', async () => {
    await expect(
      transmuxTsToMp4({ segments: [new TextEncoder().encode('not transport stream')] }),
    ).rejects.toThrow('mux.js browser transmux requires MPEG-TS segments.');
  });

  test('transmuxes MPEG-TS bytes into MP4 bytes through mux.js', async () => {
    const result = await transmuxTsToMp4({
      segments: [fixtureBytes('test-segment.ts')],
    });

    expect(result.mimeType).toBe('video/mp4');
    expect(result.bytes.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(result.bytes.slice(4, 8))).toBe('ftyp');
  });

  test('rejects empty mux.js output', async () => {
    const emptyPacket = new Uint8Array(188);
    emptyPacket[0] = 0x47;

    await expect(
      transmuxTsToMp4({ segments: [emptyPacket] }),
    ).rejects.toThrow('mux.js produced no MP4 output.');
  });
});
