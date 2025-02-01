#!/usr/bin/env node
import { dispatchNativeRequest } from './dispatcher.js';
import { readNativeMessages } from './read-native-message.js';
import { writeNativeMessage } from './write-native-message.js';

const main = async (): Promise<void> => {
  for await (const request of readNativeMessages(process.stdin)) {
    writeNativeMessage(process.stdout, await dispatchNativeRequest(request));
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown native helper error';
  writeNativeMessage(process.stdout, {
    type: 'ERROR',
    payload: {
      code: 'HELPER_ERROR',
      message,
    },
  });
  process.exitCode = 1;
});
