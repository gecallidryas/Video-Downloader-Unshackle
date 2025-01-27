#!/usr/bin/env node
import { readNativeMessages } from './read-native-message.js';
import { writeNativeMessage } from './write-native-message.js';

const main = async (): Promise<void> => {
  for await (const request of readNativeMessages(process.stdin)) {
    if (typeof request === 'object' && request !== null && !Array.isArray(request) && request.type === 'PING') {
      writeNativeMessage(process.stdout, {
        type: 'PONG',
        ...(typeof request.requestId === 'string' ? { requestId: request.requestId } : {}),
        payload: {
          helper: '@unshackle/ffmpeg-helper',
          ok: true,
        },
      });
      continue;
    }

    writeNativeMessage(process.stdout, {
      type: 'ERROR',
      payload: {
        code: 'NOT_IMPLEMENTED',
        message: 'Native ffmpeg helper dispatcher is not implemented yet.',
      },
    });
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
