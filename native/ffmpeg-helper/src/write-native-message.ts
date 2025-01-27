import type { Writable } from 'node:stream';
import { encodeNativeMessage, type NativeJson } from './native-protocol.js';

export const writeNativeMessage = (output: Writable, message: NativeJson): void => {
  output.write(encodeNativeMessage(message));
};
