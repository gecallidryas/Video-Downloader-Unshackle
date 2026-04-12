#!/usr/bin/env node
import { dispatchNativeRequest, type ProgressEmitter } from './dispatcher.js';
import { readNativeMessages } from './read-native-message.js';
import { writeNativeMessage } from './write-native-message.js';

// Track the requestId of the in-flight request so the top-level catch can echo it back.
// Without this, a fatal crash produces an ERROR with no requestId, which the client's
// validateResponse rejects as NATIVE_INVALID_RESPONSE, masking the real error.
let inFlightRequestId = 'unknown';

const main = async (): Promise<void> => {
  for await (const request of readNativeMessages(process.stdin)) {
    if (
      typeof request === 'object' &&
      request !== null &&
      'requestId' in request &&
      typeof (request as Record<string, unknown>).requestId === 'string'
    ) {
      inFlightRequestId = (request as Record<string, unknown>).requestId as string;
    }

    const emit: ProgressEmitter = (message) => writeNativeMessage(process.stdout, message);
    writeNativeMessage(process.stdout, await dispatchNativeRequest(request, {}, emit));
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown native helper error';
  writeNativeMessage(process.stdout, {
    type: 'ERROR',
    requestId: inFlightRequestId,
    payload: {
      code: 'HELPER_ERROR',
      message,
    },
  });
  process.exitCode = 1;
});
