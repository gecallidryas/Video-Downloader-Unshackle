import { type NativeJson } from './native-protocol.js';
export interface ReadNativeMessageOptions {
    maxMessageBytes?: number;
}
export declare const readNativeMessage: (input: AsyncIterable<Buffer | Uint8Array | string>, options?: ReadNativeMessageOptions) => Promise<NativeJson>;
export declare function readNativeMessages(input: AsyncIterable<Buffer | Uint8Array | string>, options?: ReadNativeMessageOptions): AsyncGenerator<NativeJson>;
