import { Readable, PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readNativeMessage, readNativeMessages } from '../read-native-message';
import { writeNativeMessage } from '../write-native-message';

const encodeNativeMessage = (payload: unknown): Buffer => {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.byteLength, 0);
  return Buffer.concat([header, body]);
};

describe('Chrome native messaging stdio framing', () => {
  it('decodes a 4-byte little-endian length prefix', async () => {
    const payload = { type: 'PING', requestId: 'req-1' };
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const header = Buffer.from([body.byteLength, 0, 0, 0]);
    const stream = Readable.from([Buffer.concat([header, body])]);

    await expect(readNativeMessage(stream)).resolves.toEqual(payload);
  });

  it('decodes a JSON payload', async () => {
    const payload = {
      type: 'EXPORT_MEDIA',
      requestId: 'req-2',
      payload: { outputName: 'clip.mp4', trim: { startSec: 1, endSec: 3 } },
    };

    await expect(readNativeMessage(Readable.from([encodeNativeMessage(payload)]))).resolves.toEqual(payload);
  });

  it('decodes multiple framed messages from one chunk without dropping buffered bytes', async () => {
    const first = { type: 'PING', requestId: 'req-first' };
    const second = { type: 'PING', requestId: 'req-second' };
    const stream = Readable.from([
      Buffer.concat([encodeNativeMessage(first), encodeNativeMessage(second)]),
    ]);

    const messages = [];
    for await (const message of readNativeMessages(stream)) {
      messages.push(message);
    }

    expect(messages).toEqual([first, second]);
  });

  it('rejects oversized messages before reading the payload', async () => {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(9, 0);

    await expect(readNativeMessage(Readable.from([header]), { maxMessageBytes: 8 })).rejects.toMatchObject({
      code: 'MESSAGE_TOO_LARGE',
    });
  });

  it('prefixes JSON responses with a 4-byte little-endian length', async () => {
    const stream = new PassThrough();
    const response = { type: 'PONG', requestId: 'req-3', payload: { ok: true } };

    writeNativeMessage(stream, response);
    stream.end();

    const encoded = Buffer.concat(await stream.toArray());
    const payloadLength = encoded.readUInt32LE(0);
    const payload = JSON.parse(encoded.subarray(4).toString('utf8'));

    expect(payloadLength).toBe(encoded.byteLength - 4);
    expect(payload).toEqual(response);
  });
});
