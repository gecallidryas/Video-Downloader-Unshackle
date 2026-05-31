export const NATIVE_MESSAGE_HEADER_BYTES = 4;
export const DEFAULT_MAX_NATIVE_MESSAGE_BYTES = 64 * 1024 * 1024;
export class NativeProtocolError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'NativeProtocolError';
    }
}
export const encodeNativeMessage = (message) => {
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    const header = Buffer.alloc(NATIVE_MESSAGE_HEADER_BYTES);
    header.writeUInt32LE(body.byteLength, 0);
    return Buffer.concat([header, body]);
};
export const decodeNativeMessageBody = (body) => {
    try {
        return JSON.parse(body.toString('utf8'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
        throw new NativeProtocolError('INVALID_JSON', `Invalid native message JSON: ${message}`);
    }
};
//# sourceMappingURL=native-protocol.js.map