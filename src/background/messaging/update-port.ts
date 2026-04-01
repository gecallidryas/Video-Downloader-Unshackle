export const UPDATE_PORT_NAME = 'unshackle:updates';

export interface UpdatePortLike {
  postMessage(message: unknown): void;
  onDisconnect: {
    addListener(callback: () => void): void;
  };
}

export interface UpdatePortBroadcaster {
  addPort(port: UpdatePortLike): void;
  broadcast(message: unknown): void;
  size(): number;
}

export function createUpdatePortBroadcaster(): UpdatePortBroadcaster {
  const ports = new Set<UpdatePortLike>();

  return {
    addPort(port) {
      ports.add(port);
      port.onDisconnect.addListener(() => {
        ports.delete(port);
      });
    },

    broadcast(message) {
      for (const port of ports) {
        try {
          port.postMessage(message);
        } catch {
          ports.delete(port);
        }
      }
    },

    size() {
      return ports.size;
    },
  };
}
