export type MediaControlCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle-pip' }
  | { type: 'screenshot' }
  | { type: 'seek'; deltaSeconds: number };

export interface MediaControlBridge {
  send(command: MediaControlCommand): Promise<void>;
}

export interface MediaControlBridgeOptions {
  dispatch?: (command: MediaControlCommand) => Promise<void>;
}

export function createMediaControlBridge(
  options: MediaControlBridgeOptions = {},
): MediaControlBridge {
  return {
    async send(command) {
      if (options.dispatch) {
        await options.dispatch(command);
        return;
      }
      const runtime = globalThis.chrome?.runtime;
      if (runtime?.sendMessage) {
        await runtime.sendMessage({ type: 'media-control', command });
      }
    },
  };
}
