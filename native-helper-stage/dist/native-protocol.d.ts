export declare const NATIVE_MESSAGE_HEADER_BYTES = 4;
export declare const DEFAULT_MAX_NATIVE_MESSAGE_BYTES: number;
export type NativeJson = null | boolean | number | string | NativeJson[] | {
    [key: string]: NativeJson;
};
export type NativeProtocolErrorCode = 'INVALID_HEADER' | 'INVALID_JSON' | 'MESSAGE_TOO_LARGE' | 'STREAM_ENDED';
export declare class NativeProtocolError extends Error {
    readonly code: NativeProtocolErrorCode;
    constructor(code: NativeProtocolErrorCode, message: string);
}
export declare const encodeNativeMessage: (message: NativeJson) => Buffer;
export declare const decodeNativeMessageBody: (body: Buffer) => NativeJson;
