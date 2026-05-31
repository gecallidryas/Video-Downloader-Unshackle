import { encodeNativeMessage } from './native-protocol.js';
export const writeNativeMessage = (output, message) => {
    output.write(encodeNativeMessage(message));
};
//# sourceMappingURL=write-native-message.js.map