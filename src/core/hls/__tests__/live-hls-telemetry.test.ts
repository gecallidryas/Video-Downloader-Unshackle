import { describe, expect, test } from 'vitest';
import { createLiveHlsTelemetry } from '../live-hls-telemetry';

describe('LiveHlsTelemetry', () => {
  test('tracks no-new-segment retries', () => {
    const telemetry = createLiveHlsTelemetry();

    telemetry.recordRefresh({ newSegments: 0, lastSequence: 5 });
    telemetry.recordRefresh({ newSegments: 0, lastSequence: 5 });
    telemetry.recordRefresh({ newSegments: 2, lastSequence: 7 });

    expect(telemetry.snapshot()).toEqual({
      noNewSegmentRetries: 2,
      lastSequence: 7,
      state: 'live',
      totalRefreshes: 3,
    });
  });

  test('transitions to idle after max retries', () => {
    const telemetry = createLiveHlsTelemetry({ maxIdleRetries: 3 });

    for (let index = 0; index < 4; index += 1) {
      telemetry.recordRefresh({ newSegments: 0, lastSequence: 5 });
    }

    expect(telemetry.snapshot().state).toBe('idle');
  });
});
