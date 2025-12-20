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
      theme: 'dark',
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
      customCommandTemplate: '',
      aria2Enabled: false,
      aria2RpcUrl: 'http://localhost:6800/jsonrpc',
      aria2Secret: '',
      webhookEnabled: false,
      webhookUrl: '',
      previousSessionLimit: 50,
      externalPlayerProfiles: [],
      _schemaVersion: 10,
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

  test('normalizes external integrations and rejects malformed player profiles', async () => {
    const values: Record<string, unknown> = {
      [SETTINGS_STORAGE_KEY]: {
        customCommandTemplate: 'yt-dlp {url}',
        aria2Enabled: true,
        aria2RpcUrl: 'http://example.local:6800/jsonrpc',
        aria2Secret: 'shh',
        webhookEnabled: true,
        webhookUrl: 'https://hook.example/notify',
        externalPlayerProfiles: [
          { id: 'vlc', name: 'VLC', path: '/usr/bin/vlc' },
          { id: 'bad' },
          'not-an-object',
        ],
      },
    };
    const storage = {
      get: vi.fn(async () => values),
      set: vi.fn(async () => undefined),
    };
    const store = createSettingsStore({ storage });
    const loaded = await store.load();
    expect(loaded.customCommandTemplate).toBe('yt-dlp {url}');
    expect(loaded.aria2Enabled).toBe(true);
    expect(loaded.aria2RpcUrl).toBe('http://example.local:6800/jsonrpc');
    expect(loaded.aria2Secret).toBe('shh');
    expect(loaded.webhookEnabled).toBe(true);
    expect(loaded.webhookUrl).toBe('https://hook.example/notify');
    expect(loaded.externalPlayerProfiles).toEqual([
      { id: 'vlc', name: 'VLC', path: '/usr/bin/vlc' },
    ]);
  });

  test('falls back to defaults for invalid integration values', async () => {
    const storage = {
      get: vi.fn(async () => ({
        [SETTINGS_STORAGE_KEY]: {
          aria2RpcUrl: '',
          externalPlayerProfiles: 'nope',
          customCommandTemplate: 5,
        },
      })),
      set: vi.fn(async () => undefined),
    };
    const store = createSettingsStore({ storage });
    const loaded = await store.load();
    expect(loaded.aria2RpcUrl).toBe('http://localhost:6800/jsonrpc');
    expect(loaded.externalPlayerProfiles).toEqual([]);
    expect(loaded.customCommandTemplate).toBe('');
  });
});
