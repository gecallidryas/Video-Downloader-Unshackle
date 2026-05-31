import { DEFAULT_MAX_NATIVE_MESSAGE_BYTES, NativeProtocolError, NATIVE_MESSAGE_HEADER_BYTES, decodeNativeMessageBody, } from './native-protocol.js';
export const readNativeMessage = async (input, options = {}) => {
    for await (const message of readNativeMessages(input, options)) {
        return message;
    }
    throw new NativeProtocolError('STREAM_ENDED', 'Native message stream ended before a complete message was read');
};
export async function* readNativeMessages(input, options = {}) {
    const maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_NATIVE_MESSAGE_BYTES;
    let buffered = Buffer.alloc(0);
    let messageBytes;
    for await (const chunk of input) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        buffered = Buffer.concat([buffered, buffer]);
        while (buffered.byteLength >= NATIVE_MESSAGE_HEADER_BYTES) {
            messageBytes ??= buffered.readUInt32LE(0);
            if (messageBytes > maxMessageBytes) {
                throw new NativeProtocolError('MESSAGE_TOO_LARGE', `Native message is ${messageBytes} bytes, maximum is ${maxMessageBytes} bytes`);
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
        throw new NativeProtocolError(buffered.byteLength < NATIVE_MESSAGE_HEADER_BYTES ? 'INVALID_HEADER' : 'STREAM_ENDED', 'Native message stream ended before a complete message was read');
    }
}
//# sourceMappingURL=read-native-message.js.map