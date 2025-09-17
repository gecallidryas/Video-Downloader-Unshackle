import type {
  NotificationMode,
  UnifiedSettings,
} from '@/src/background/settings/settings-store';

export interface DetectionNotificationPayload {
  count: number;
  hostname: string;
}

export interface DetectionNotifierOptions {
  emit: (payload: DetectionNotificationPayload) => void;
  setBadge?: (text: string) => void;
  windowMs?: number;
  scheduler?: {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
  };
}

export interface DetectionNotifier {
  configure(settings: Partial<UnifiedSettings>): void;
  recordDetection(hostname: string, count?: number): void;
  flush(): void;
  reset(): void;
}

interface PendingBatch {
  hostname: string;
  count: number;
}

export function createDetectionNotifier(
  options: DetectionNotifierOptions,
): DetectionNotifier {
  const windowMs = options.windowMs ?? 2_000;
  const scheduler = options.scheduler ?? {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };

  let mode: NotificationMode = 'batched';
  let totalBadge = 0;
  let pending: PendingBatch | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flushPending() {
    if (timer !== null) {
      scheduler.clearTimeout(timer);
      timer = null;
    }

    if (!pending) {
      return;
    }

    options.emit({ count: pending.count, hostname: pending.hostname });
    pending = null;
  }

  return {
    configure(settings) {
      if (settings.notificationMode) {
        mode = settings.notificationMode;
      }
    },

    recordDetection(hostname, count = 1) {
      if (count <= 0) {
        return;
      }

      totalBadge += count;
      options.setBadge?.(String(totalBadge));

      if (mode === 'off') {
        return;
      }

      if (mode === 'each') {
        options.emit({ count, hostname });
        return;
      }

      if (!pending || pending.hostname === hostname) {
        pending = {
          hostname: pending?.hostname ?? hostname,
          count: (pending?.count ?? 0) + count,
        };
      } else {
        flushPending();
        pending = { hostname, count };
      }

      if (timer !== null) {
        scheduler.clearTimeout(timer);
      }

      timer = scheduler.setTimeout(() => {
        timer = null;
        flushPending();
      }, windowMs);
    },

    flush() {
      flushPending();
    },

    reset() {
      if (timer !== null) {
        scheduler.clearTimeout(timer);
        timer = null;
      }

      pending = null;
      totalBadge = 0;
      options.setBadge?.('');
    },
  };
}
