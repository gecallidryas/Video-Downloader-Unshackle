export const NATIVE_MESSAGE_HEADER_BYTES = 4;
export const DEFAULT_MAX_NATIVE_MESSAGE_BYTES = 64 * 1024 * 1024;

export type NativeJson =
  | null
  | boolean
  | number
  | string
  | NativeJson[]
  | { [key: string]: NativeJson };

export type NativeProtocolErrorCode =
  | 'INVALID_HEADER'
  | 'INVALID_JSON'
  | 'MESSAGE_TOO_LARGE'
  | 'STREAM_ENDED';

export class NativeProtocolError extends Error {
  constructor(
    public readonly code: NativeProtocolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NativeProtocolError';
  }
}

export const encodeNativeMessage = (message: NativeJson): Buffer => {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(NATIVE_MESSAGE_HEADER_BYTES);
  header.writeUInt32LE(body.byteLength, 0);
  return Buffer.concat([header, body]);
};

export const decodeNativeMessageBody = (body: Buffer): NativeJson => {
  try {
    return JSON.parse(body.toString('utf8')) as NativeJson;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
    throw new NativeProtocolError('INVALID_JSON', `Invalid native message JSON: ${message}`);
  }
};
