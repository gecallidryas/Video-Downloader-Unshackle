import {
  DEFAULT_MAX_NATIVE_MESSAGE_BYTES,
  NativeProtocolError,
  NATIVE_MESSAGE_HEADER_BYTES,
  decodeNativeMessageBody,
  type NativeJson,
} from './native-protocol.js';

export interface ReadNativeMessageOptions {
  maxMessageBytes?: number;
}

export const readNativeMessage = async (
  input: AsyncIterable<Buffer | Uint8Array | string>,
  options: ReadNativeMessageOptions = {},
): Promise<NativeJson> => {
  for await (const message of readNativeMessages(input, options)) {
    return message;
  }

  throw new NativeProtocolError(
    'STREAM_ENDED',
    'Native message stream ended before a complete message was read',
  );
};

export async function* readNativeMessages(
  input: AsyncIterable<Buffer | Uint8Array | string>,
  options: ReadNativeMessageOptions = {},
): AsyncGenerator<NativeJson> {
  const maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_NATIVE_MESSAGE_BYTES;
  let buffered = Buffer.alloc(0);
  let messageBytes: number | undefined;

  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    buffered = Buffer.concat([buffered, buffer]);

    while (buffered.byteLength >= NATIVE_MESSAGE_HEADER_BYTES) {
      messageBytes ??= buffered.readUInt32LE(0);

      if (messageBytes > maxMessageBytes) {
        throw new NativeProtocolError(
          'MESSAGE_TOO_LARGE',
          `Native message is ${messageBytes} bytes, maximum is ${maxMessageBytes} bytes`,
        );
      }

      if (buffered.byteLength < NATIVE_MESSAGE_HEADER_BYTES + messageBytes) {
        break;
      }

      const bodyStart = NATIVE_MESSAGE_HEADER_BYTES;
      const bodyEnd = bodyStart + messageBytes;
      const body = buffered.subarray(bodyStart, bodyEnd);
      buffered = buffered.subarray(bodyEnd);
      messageBytes = undefined;

      yield decodeNativeMessageBody(body);
    }
  }

  if (buffered.byteLength > 0 || messageBytes !== undefined) {
    throw new NativeProtocolError(
      buffered.byteLength < NATIVE_MESSAGE_HEADER_BYTES ? 'INVALID_HEADER' : 'STREAM_ENDED',
      'Native message stream ended before a complete message was read',
    );
  }
}
