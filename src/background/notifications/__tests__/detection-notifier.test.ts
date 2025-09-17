import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createDetectionNotifier } from '../detection-notifier';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('detection notifier', () => {
  test('off mode suppresses notifications', () => {
    const emit = vi.fn();
    const notifier = createDetectionNotifier({ emit });
    notifier.configure({ notificationMode: 'off' });

    notifier.recordDetection('example.com');
    vi.advanceTimersByTime(3_000);

    expect(emit).not.toHaveBeenCalled();
  });

  test('each mode emits per detection', () => {
    const emit = vi.fn();
    const notifier = createDetectionNotifier({ emit });
    notifier.configure({ notificationMode: 'each' });

    notifier.recordDetection('a.com', 2);
    notifier.recordDetection('b.com');

    expect(emit).toHaveBeenCalledTimes(2);
  });

  test('batched mode coalesces within window', () => {
    const emit = vi.fn();
    const notifier = createDetectionNotifier({ emit, windowMs: 2_000 });
    notifier.configure({ notificationMode: 'batched' });

    notifier.recordDetection('a.com', 3);
    notifier.recordDetection('a.com', 4);

    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ count: 7, hostname: 'a.com' });
  });

  test('batched mode flushes prior batch when hostname changes', () => {
    const emit = vi.fn();
    const notifier = createDetectionNotifier({ emit, windowMs: 2_000 });
    notifier.configure({ notificationMode: 'batched' });

    notifier.recordDetection('a.com', 2);
    notifier.recordDetection('b.com', 1);

    expect(emit).toHaveBeenCalledWith({ count: 2, hostname: 'a.com' });

    vi.advanceTimersByTime(2_000);
    expect(emit).toHaveBeenCalledWith({ count: 1, hostname: 'b.com' });
  });

  test('badge text accumulates and resets', () => {
    const emit = vi.fn();
    const setBadge = vi.fn();
    const notifier = createDetectionNotifier({ emit, setBadge });
    notifier.configure({ notificationMode: 'batched' });

    notifier.recordDetection('a.com', 3);
    notifier.recordDetection('a.com', 2);

    expect(setBadge).toHaveBeenLastCalledWith('5');

    notifier.reset();
    expect(setBadge).toHaveBeenLastCalledWith('');
  });
});
