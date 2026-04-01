import { describe, expect, it, vi } from 'vitest';
import { createUpdatePortBroadcaster, type UpdatePortLike } from '../update-port';

function fakePort(): UpdatePortLike & { fireDisconnect: () => void; posted: unknown[] } {
  const posted: unknown[] = [];
  let disconnectCb: (() => void) | undefined;
  return {
    posted,
    postMessage(message) {
      posted.push(message);
    },
    onDisconnect: {
      addListener(cb) {
        disconnectCb = cb;
      },
    },
    fireDisconnect() {
      disconnectCb?.();
    },
  };
}

describe('update-port broadcaster', () => {
  it('pushes a broadcast to every connected port', () => {
    const broadcaster = createUpdatePortBroadcaster();
    const a = fakePort();
    const b = fakePort();
    broadcaster.addPort(a);
    broadcaster.addPort(b);

    broadcaster.broadcast({ type: 'JOBS_UPDATED', jobs: [] });

    expect(a.posted).toHaveLength(1);
    expect(b.posted).toHaveLength(1);
    expect(broadcaster.size()).toBe(2);
  });

  it('drops a port after it disconnects', () => {
    const broadcaster = createUpdatePortBroadcaster();
    const a = fakePort();
    broadcaster.addPort(a);

    a.fireDisconnect();
    broadcaster.broadcast({ type: 'JOBS_UPDATED', jobs: [] });

    expect(a.posted).toHaveLength(0);
    expect(broadcaster.size()).toBe(0);
  });

  it('continues broadcasting when one port throws', () => {
    const broadcaster = createUpdatePortBroadcaster();
    const bad = fakePort();
    bad.postMessage = vi.fn(() => {
      throw new Error('port closed');
    });
    const good = fakePort();
    broadcaster.addPort(bad);
    broadcaster.addPort(good);

    expect(() => broadcaster.broadcast({ type: 'PING' })).not.toThrow();
    expect(good.posted).toHaveLength(1);
  });
});
