import type { Writable } from 'node:stream';
import { type NativeJson } from './native-protocol.js';
export declare const writeNativeMessage: (output: Writable, message: NativeJson) => void;
