import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  createMuxjsStreamingTransmuxSession,
  type MuxjsTransmuxer,
  type MuxjsTransmuxerOptions,
  transmuxTsToMp4,
  validateMp4Structure,
} from '../muxjs-transmuxer';

type MuxjsDataCallback = (data: { initSegment?: Uint8Array; data?: Uint8Array }) => void;

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

  test('reuses a single transmuxer across segments and lets mux.js own decode-time continuity', async () => {
    const chunks: Uint8Array[] = [];
    const baseDecodeTimes: number[] = [];
    let constructionCount = 0;
    let constructedWith: MuxjsTransmuxerOptions | undefined;
    const createTransmuxer = async (
      options?: MuxjsTransmuxerOptions,
    ): Promise<MuxjsTransmuxer> => {
      constructionCount += 1;
      constructedWith = options;
      const dataCallbacks: MuxjsDataCallback[] = [];

      return {
        on(event, callback) {
          if (event === 'data') {
            dataCallbacks.push(callback as MuxjsDataCallback);
          }
        },
        push() {
          return undefined;
        },
        flush() {
          dataCallbacks.forEach((callback) =>
            callback({
              initSegment: new Uint8Array([0x00, 0x00, 0x00, 0x08, 0x66, 0x74, 0x79, 0x70]),
              data: new Uint8Array([0x01]),
            }),
          );
        },
        setBaseMediaDecodeTime(time) {
          baseDecodeTimes.push(time);
        },
      };
    };
    const tsPacket = new Uint8Array(188);
    tsPacket[0] = 0x47;
    const session = await createMuxjsStreamingTransmuxSession(
      async (chunk) => {
        chunks.push(chunk);
      },
      { createTransmuxer },
    );

    await session.append(tsPacket, { durationSec: 10 });
    await session.append(tsPacket, { durationSec: 10 });
    await session.finalize();

    expect(constructionCount).toBe(1);
    expect(constructedWith).toMatchObject({
      keepOriginalTimestamps: false,
      remux: true,
      baseMediaDecodeTime: 0,
    });
    // The session must not hand-manage the decode timeline; mux.js owns it.
    expect(baseDecodeTimes).toEqual([]);
    expect(chunks).toEqual([
      new Uint8Array([0x00, 0x00, 0x00, 0x08, 0x66, 0x74, 0x79, 0x70]),
      new Uint8Array([0x01]),
      new Uint8Array([0x01]),
    ]);
  });

  test('exposes the produced init segment for downstream MP4 validation', async () => {
    const initBytes = new Uint8Array([0x00, 0x00, 0x00, 0x08, 0x66, 0x74, 0x79, 0x70, 0x99]);
    const transmuxer: MuxjsTransmuxer = (() => {
      const dataCallbacks: MuxjsDataCallback[] = [];

      return {
        on(event, callback) {
          if (event === 'data') {
            dataCallbacks.push(callback as MuxjsDataCallback);
          }
        },
        push() {
          return undefined;
        },
        flush() {
          dataCallbacks.forEach((callback) =>
            callback({ initSegment: initBytes, data: new Uint8Array([0x01]) }),
          );
        },
      };
    })();
    const tsPacket = new Uint8Array(188);
    tsPacket[0] = 0x47;
    const session = await createMuxjsStreamingTransmuxSession(async () => undefined, {
      createTransmuxer: async () => transmuxer,
    });

    await session.append(tsPacket);
    await session.finalize();

    expect(session.initSegment).toEqual(initBytes);
  });


  test('does not perform an empty final flush after each segment was already flushed', async () => {
    const chunks: Uint8Array[] = [];
    const dataCallbacks: MuxjsDataCallback[] = [];
    let flushCount = 0;
    const transmuxer: MuxjsTransmuxer = {
      on(event, callback) {
        if (event === 'data') {
          dataCallbacks.push(callback as MuxjsDataCallback);
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
    const dataCallbacks: MuxjsDataCallback[] = [];
    const initSegment = new Uint8Array([0x00, 0x00, 0x00, 0x08, 0x66, 0x74, 0x79, 0x70]);
    const transmuxer: MuxjsTransmuxer = {
      on(event, callback) {
        if (event === 'data') {
          dataCallbacks.push(callback as MuxjsDataCallback);
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

  test('emitted media fragments are defensively copied — mutating source after emit does not corrupt the chunk', async () => {
    const emittedChunks: Uint8Array[] = [];
    const dataCallbacks: MuxjsDataCallback[] = [];
    const sourceDataBuffer = new Uint8Array([0x01, 0x02, 0x03]);
    const transmuxer: MuxjsTransmuxer = {
      on(event, callback) {
        if (event === 'data') {
          dataCallbacks.push(callback as MuxjsDataCallback);
        }
      },
      push() {
        return undefined;
      },
      flush() {
        dataCallbacks.forEach((callback) =>
          callback({
            initSegment: new Uint8Array([0x00, 0x00, 0x00, 0x08, 0x66, 0x74, 0x79, 0x70]),
            data: sourceDataBuffer,
          }),
        );
        // Mutate the source buffer immediately after the synchronous data event fires.
        sourceDataBuffer[0] = 0xff;
        sourceDataBuffer[1] = 0xff;
        sourceDataBuffer[2] = 0xff;
      },
    };
    const tsPacket = new Uint8Array(188);
    tsPacket[0] = 0x47;
    const session = await createMuxjsStreamingTransmuxSession(
      async (chunk) => {
        emittedChunks.push(chunk);
      },
      { createTransmuxer: async () => transmuxer },
    );

    await session.append(tsPacket);
    await session.finalize();

    const mediaChunk = emittedChunks.find((c) => c.byteLength === 3);
    expect(mediaChunk).toBeDefined();
    // The chunk must be a copy — it must NOT reflect the post-emit mutation.
    expect(Array.from(mediaChunk!)).toEqual([0x01, 0x02, 0x03]);
  });

  test('rejects empty mux.js output', async () => {
    const emptyPacket = new Uint8Array(188);
    emptyPacket[0] = 0x47;

    await expect(
      transmuxTsToMp4({ segments: [emptyPacket] }),
    ).rejects.toThrow('mux.js produced no MP4 output.');
  });
});

describe('validateMp4Structure', () => {
  function be32(value: number): number[] {
    return [
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ];
  }

  function box(type: string, payload: number[]): number[] {
    const size = 8 + payload.length;

    return [
      ...be32(size),
      type.charCodeAt(0),
      type.charCodeAt(1),
      type.charCodeAt(2),
      type.charCodeAt(3),
      ...payload,
    ];
  }

  function initSegment(): Uint8Array {
    // mux.js always writes the fragmented-MP4 mvhd duration sentinel 0xffffffff,
    // so the init segment itself must never be flagged on duration alone.
    const mvhd = box('mvhd', [
      0x00, 0x00, 0x00, 0x00, // version + flags
      ...be32(0), // creation
      ...be32(0), // modification
      ...be32(90_000), // timescale
      ...be32(0xffff_ffff), // duration sentinel
    ]);

    return new Uint8Array([
      ...box('ftyp', [0x69, 0x73, 0x6f, 0x6d]),
      ...box('moov', mvhd),
    ]);
  }

  function fragmentWithTfdt(version: 0 | 1, decodeTimeTicks: number): Uint8Array {
    const tfdtPayload =
      version === 1
        ? [
            0x01, 0x00, 0x00, 0x00,
            ...be32(Math.floor(decodeTimeTicks / 0x1_0000_0000)),
            ...be32(decodeTimeTicks % 0x1_0000_0000),
          ]
        : [0x00, 0x00, 0x00, 0x00, ...be32(decodeTimeTicks)];
    const traf = box('traf', box('tfdt', tfdtPayload));
    const moof = box('moof', traf);

    return new Uint8Array([...moof, ...box('mdat', [0x00])]);
  }

  test('flags MP4 output missing ftyp or moov as invalid', () => {
    const onlyFtyp = new Uint8Array(box('ftyp', [0x00, 0x00, 0x00, 0x00]));

    expect(validateMp4Structure(onlyFtyp)).toMatchObject({
      valid: false,
      hasFtyp: true,
      hasMoov: false,
    });
  });

  test('accepts a fragmented MP4 with a sane first decode time', () => {
    expect(
      validateMp4Structure(initSegment(), fragmentWithTfdt(0, 0)),
    ).toMatchObject({
      valid: true,
      hasFtyp: true,
      hasMoov: true,
      firstDecodeTimeTicks: 0,
    });
  });

  test('accepts the init segment alone (mvhd sentinel duration is not flagged)', () => {
    expect(validateMp4Structure(initSegment())).toMatchObject({
      valid: true,
      hasFtyp: true,
      hasMoov: true,
    });
  });

  test('rejects a fragment whose first tfdt decode time is at the 32-bit wrap boundary', () => {
    expect(
      validateMp4Structure(initSegment(), fragmentWithTfdt(0, 0xffff_ffff)),
    ).toMatchObject({
      valid: false,
      hasFtyp: true,
      hasMoov: true,
    });
  });
});
