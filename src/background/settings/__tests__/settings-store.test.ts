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
      segmentTimeoutMs: 30_000,
      maxBandwidthPerHostKBps: 0,
      preferredQuality: 'highest',
      defaultQualityPolicy: 'ask',
      defaultOutputFormat: 'auto',
      providerDefaults: {},
      saveAsPrompt: true,
      preferredAudioLanguage: 'en',
      downloadSubtitles: false,
      showNotifications: true,
      notifyOnComplete: true,
      notifyOnError: true,
      notificationMode: 'batched',
      historyRetentionDays: 30,
      namingTemplate: '{title}_{quality}_{date}_{time}',
      defaultActionPerHost: {},
      enableContextMenu: true,
      remoteConfigSecurityMode: 'strict',
      suppressProtectedDownloads: true,
      captureCredentialHeaders: false,
      captureRuleCustomExtensions: [],
      captureRuleCustomContentTypes: [],
      captureRuleUrlBlacklist: [],
      captureRuleMinSizeBytes: 0,
      captureRuleSizePredicate: '',
      advancedMode: false,
      autoDownloadEnabled: false,
      autoDownloadMinSize: 102_400,
      autoDownloadBlacklist: [],
      _schemaVersion: 9,
    });
  });

  test('advancedMode defaults to false', async () => {
    const store = createSettingsStore();
    const settings = await store.load();

    expect(settings.advancedMode).toBe(false);
  });

  test('captureCredentialHeaders defaults to false', async () => {
    const store = createSettingsStore();
    const settings = await store.load();

    expect(settings.captureCredentialHeaders).toBe(false);
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
    await store.setMany({
      preferredQuality: '720p',
      enableContextMenu: false,
      providerDefaults: {
        vimeo: {
          quality: '720p',
          container: 'mp4',
          subtitles: true,
          dashPairing: 'video-with-audio',
        },
      },
    });

    expect(store.get('maxConcurrentDownloads')).toBe(4);
    expect(store.getAll()).toMatchObject({
      preferredQuality: '720p',
      enableContextMenu: false,
      providerDefaults: {
        vimeo: {
          quality: '720p',
          container: 'mp4',
          subtitles: true,
          dashPairing: 'video-with-audio',
        },
      },
    });
    expect(storage.set).toHaveBeenLastCalledWith({
      [SETTINGS_STORAGE_KEY]: expect.objectContaining({
        maxConcurrentDownloads: 4,
        preferredQuality: '720p',
        enableContextMenu: false,
        providerDefaults: {
          vimeo: {
            quality: '720p',
            container: 'mp4',
            subtitles: true,
            dashPairing: 'video-with-audio',
          },
        },
      }),
    });

    await store.reset();
    expect(store.getAll()).toEqual(DEFAULT_SETTINGS);
  });
});
