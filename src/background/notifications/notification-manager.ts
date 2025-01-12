import type { UnifiedSettings } from '@/src/background/settings/settings-store';

export interface NotificationRuntime {
  sendMessage(message: unknown): Promise<unknown>;
}

export interface NotificationManager {
  applySettings(settings: Partial<UnifiedSettings>): void;
  showDownloadCompleted(title: string, filename?: string): Promise<void>;
  showDownloadFailed(title: string, error?: string): Promise<void>;
}

export function createNotificationManager(
  runtime: NotificationRuntime = chrome.runtime,
): NotificationManager {
  let showNotifications = true;
  let notifyOnComplete = true;
  let notifyOnError = true;

  async function send(text: string, warningType: 'info' | 'error') {
    if (!showNotifications) {
      return;
    }

    await runtime.sendMessage({
      type: 'SHOW_WARNING',
      payload: { text, warningType, autoHideMs: warningType === 'info' ? 4500 : null },
    }).catch(() => undefined);
  }

  return {
    applySettings(settings) {
      showNotifications = settings.showNotifications !== false;
      notifyOnComplete = settings.notifyOnComplete !== false;
      notifyOnError = settings.notifyOnError !== false;
    },

    async showDownloadCompleted(title, filename) {
      if (notifyOnComplete) {
        await send(`Download Complete: ${filename ?? title}`, 'info');
      }
    },

    async showDownloadFailed(title, error = 'Unknown error') {
      if (notifyOnError) {
        await send(`Download Failed: ${title}: ${error}`, 'error');
      }
    },
  };
}
