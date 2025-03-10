import { describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  createSettingsStore,
} from '../settings-store';

describe('background settings store', () => {
  test('loads source-compatible defaults for downloader services', async () => {
    const store = createSettingsStore();

    await expect(store.load()).resolves.toMatchObject({
      theme: 'contrast',
      uiMode: 'side-panel',
      autoScanEnabled: true,
      networkCaptureEnabled: true,
      maxConcurrentDownloads: 3,
      maxConcurrentSegments: 5,
      maxConcurrentSegmentsPerHost: 3,
      maxBandwidthPerHostKBps: 0,
      preferredQuality: 'highest',
      defaultOutputFormat: 'auto',
      saveAsPrompt: true,
      preferredAudioLanguage: 'en',
      downloadSubtitles: false,
      showNotifications: true,
      notifyOnComplete: true,
      notifyOnError: true,
      historyRetentionDays: 30,
      namingTemplate: '{title}_{quality}_{date}_{time}',
      defaultActionPerHost: {},
      enableContextMenu: true,
      remoteConfigSecurityMode: 'strict',
      suppressProtectedDownloads: true,
      captureCredentialHeaders: false,
    });
  });

  test('persists set, setMany, and reset operations through the storage adapter', async () => {
    const values: Record<string, unknown> = {};
    const storage = {
      get: vi.fn(async () => values),
      set: vi.fn(async (patch: Record<string, unknown>) => {
        Object.assign(values, patch);
      }),
    };
    const store = createSettingsStore({ storage });

    await store.set('maxConcurrentDownloads', 4);
    await store.setMany({ preferredQuality: '720p', enableContextMenu: false });

    expect(store.get('maxConcurrentDownloads')).toBe(4);
    expect(store.getAll()).toMatchObject({
      preferredQuality: '720p',
      enableContextMenu: false,
    });
    expect(storage.set).toHaveBeenLastCalledWith({
      [SETTINGS_STORAGE_KEY]: expect.objectContaining({
        maxConcurrentDownloads: 4,
        preferredQuality: '720p',
        enableContextMenu: false,
      }),
    });

    await store.reset();
    expect(store.getAll()).toEqual(DEFAULT_SETTINGS);
  });
});
