import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  createMuxjsStreamingTransmuxSession,
  type MuxjsTransmuxer,
  transmuxTsToMp4,
} from '../muxjs-transmuxer';

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

  test('streams MPEG-TS bytes into MP4 chunks through mux.js', async () => {
    const chunks: Uint8Array[] = [];
    const session = await createMuxjsStreamingTransmuxSession(async (chunk) => {
      chunks.push(chunk);
    });

    await session.append(fixtureBytes('test-segment.ts'));
    await session.finalize();

    const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    expect(session.bytesEmitted).toBeGreaterThan(0);
    expect(new TextDecoder().decode(bytes.slice(4, 8))).toBe('ftyp');
  });

  test('streams multiple MPEG-TS segments as one MP4 initialization', async () => {
    const chunks: Uint8Array[] = [];
    const session = await createMuxjsStreamingTransmuxSession(async (chunk) => {
      chunks.push(chunk);
    });
    const segment = fixtureBytes('test-segment.ts');

    await session.append(segment);
    await session.append(segment);
    await session.finalize();

    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const countAscii = (value: string) => {
      let count = 0;
      let offset = 0;

      while ((offset = bytes.indexOf(value, offset)) !== -1) {
        count += 1;
        offset += value.length;
      }

      return count;
    };

    expect(countAscii('ftyp')).toBe(1);
    expect(countAscii('moov')).toBe(1);
  });


  test('does not perform an empty final flush after each segment was already flushed', async () => {
    const chunks: Uint8Array[] = [];
    const dataCallbacks: Array<(data: { initSegment?: Uint8Array; data?: Uint8Array }) => void> = [];
    let flushCount = 0;
    const transmuxer: MuxjsTransmuxer = {
      on(event, callback) {
        if (event === 'data') {
          dataCallbacks.push(callback);
        }
      },
      push() {
        return undefined;
      },
      flush() {
        flushCount += 1;
        if (flushCount > 1) {
          throw new Error('empty flush crash');
        }

        dataCallbacks.forEach((callback) =>
          callback({
            initSegment: new Uint8Array([0x00, 0x00, 0x00, 0x08, 0x66, 0x74, 0x79, 0x70]),
            data: new Uint8Array([0x01]),
          }),
        );
      },
    };
    const tsPacket = new Uint8Array(188);
    tsPacket[0] = 0x47;
    const session = await createMuxjsStreamingTransmuxSession(
      async (chunk) => {
        chunks.push(chunk);
      },
      { createTransmuxer: async () => transmuxer },
    );

    await session.append(tsPacket);
    await session.finalize();

    expect(flushCount).toBe(1);
    expect(chunks.length).toBe(2);
    expect(session.bytesEmitted).toBe(9);
  });

  test('dedupes repeated mux.js init segments in streaming output', async () => {
    const chunks: Uint8Array[] = [];
    const dataCallbacks: Array<(data: { initSegment?: Uint8Array; data?: Uint8Array }) => void> = [];
    const initSegment = new Uint8Array([0x00, 0x00, 0x00, 0x08, 0x66, 0x74, 0x79, 0x70]);
    const transmuxer: MuxjsTransmuxer = {
      on(event, callback) {
        if (event === 'data') {
          dataCallbacks.push(callback);
        }
      },
      push() {
        return undefined;
      },
      flush() {
        dataCallbacks.forEach((callback) => {
          callback({
            initSegment,
            data: new Uint8Array([0x01]),
          });
          callback({
            initSegment,
            data: new Uint8Array([0x02]),
          });
        });
      },
    };
    const tsPacket = new Uint8Array(188);
    tsPacket[0] = 0x47;
    const session = await createMuxjsStreamingTransmuxSession(
      async (chunk) => {
        chunks.push(chunk);
      },
      { createTransmuxer: async () => transmuxer },
    );

    await session.append(tsPacket);
    await session.finalize();

    expect(chunks).toEqual([
      initSegment,
      new Uint8Array([0x01]),
      new Uint8Array([0x02]),
    ]);
    expect(session.bytesEmitted).toBe(10);
  });

  test('rejects empty mux.js output', async () => {
    const emptyPacket = new Uint8Array(188);
    emptyPacket[0] = 0x47;

    await expect(
      transmuxTsToMp4({ segments: [emptyPacket] }),
    ).rejects.toThrow('mux.js produced no MP4 output.');
  });
});
