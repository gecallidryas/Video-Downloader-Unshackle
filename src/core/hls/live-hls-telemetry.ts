export type LiveHlsTelemetryState = 'live' | 'idle';

export interface LiveHlsTelemetryRefresh {
  newSegments: number;
  lastSequence: number;
}

export interface LiveHlsTelemetrySnapshot {
  noNewSegmentRetries: number;
  lastSequence: number;
  state: LiveHlsTelemetryState;
  totalRefreshes: number;
}

export interface LiveHlsTelemetry {
  recordRefresh(refresh: LiveHlsTelemetryRefresh): void;
  snapshot(): LiveHlsTelemetrySnapshot;
}

export interface LiveHlsTelemetryOptions {
  maxIdleRetries?: number;
}

export function createLiveHlsTelemetry(
  options: LiveHlsTelemetryOptions = {},
): LiveHlsTelemetry {
  const maxIdleRetries = Math.max(1, Math.floor(options.maxIdleRetries ?? 5));
  let noNewSegmentRetries = 0;
  let consecutiveNoNewSegmentRetries = 0;
  let lastSequence = 0;
  let state: LiveHlsTelemetryState = 'live';
  let totalRefreshes = 0;

  return {
    recordRefresh(refresh) {
      totalRefreshes += 1;
      lastSequence = refresh.lastSequence;

      if (refresh.newSegments > 0) {
        consecutiveNoNewSegmentRetries = 0;
        state = 'live';
        return;
      }

      noNewSegmentRetries += 1;
      consecutiveNoNewSegmentRetries += 1;
      state = consecutiveNoNewSegmentRetries > maxIdleRetries ? 'idle' : 'live';
    },

    snapshot() {
      return {
        noNewSegmentRetries,
        lastSequence,
        state,
        totalRefreshes,
      };
    },
  };
}
