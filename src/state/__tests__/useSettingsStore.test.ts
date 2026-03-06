import { SETTINGS_STORAGE_KEY } from '@/src/background/settings/settings-store';
import {
  hydrateSettingsStore,
  useSettingsStore,
} from '@/src/state/useSettingsStore';

beforeEach(() => {
  vi.unstubAllGlobals();
  useSettingsStore.setState({
    autoDetectEnabled: true,
    theme: 'dark',
    uiMode: 'side-panel',
    autoScanEnabled: true,
    downloadPath: 'Downloads',
    notificationsEnabled: true,
    showNotifications: true,
    preferredQuality: 'best',
    previewMode: 'image',
    advancedMode: false,
    enableNativeFeatures: true,
    enableBrowserFallbacks: true,
    onboardingCompleted: false,
  });
});

test('hydrates settings from extension storage', async () => {
  const storage = {
    get: vi.fn().mockResolvedValue({
      [SETTINGS_STORAGE_KEY]: {
        theme: 'light',
        preferredQuality: 'smallest',
        previewMode: 'video',
        onboardingCompleted: true,
      },
    }),
    set: vi.fn(),
  };

  await hydrateSettingsStore(storage);

  expect(storage.get).toHaveBeenCalledWith(SETTINGS_STORAGE_KEY);
  expect(useSettingsStore.getState()).toMatchObject({
    theme: 'light',
    preferredQuality: 'smallest',
    previewMode: 'video',
    onboardingCompleted: true,
  });
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
});

test('keeps current settings when extension storage has no settings record', async () => {
  const storage = {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn(),
  };

  useSettingsStore.getState().setAdvancedMode(true);

  await hydrateSettingsStore(storage);

  expect(useSettingsStore.getState().advancedMode).toBe(true);
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
});

test('persists settings changes to extension storage', () => {
  const set = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        set,
      },
    },
  });

  useSettingsStore.getState().setTheme('light');

  expect(set).toHaveBeenCalledWith({
    [SETTINGS_STORAGE_KEY]: expect.objectContaining({
      theme: 'light',
      _schemaVersion: expect.any(Number),
    }),
  });
});

test('auto detect defaults to enabled', () => {
  expect(useSettingsStore.getState().autoDetectEnabled).toBe(true);
});

test('toggleAutoDetect flips the value', () => {
  useSettingsStore.getState().toggleAutoDetect();
  expect(useSettingsStore.getState().autoDetectEnabled).toBe(false);
  useSettingsStore.getState().toggleAutoDetect();
  expect(useSettingsStore.getState().autoDetectEnabled).toBe(true);
});

test('setPreferredQuality updates quality preference', () => {
  useSettingsStore.getState().setPreferredQuality('smallest');
  expect(useSettingsStore.getState().preferredQuality).toBe('smallest');
});

test('includes unified downloader defaults used by background services', () => {
  expect(useSettingsStore.getState()).toMatchObject({
    theme: 'dark',
    uiMode: 'side-panel',
    autoScanEnabled: true,
    networkCaptureEnabled: true,
    maxConcurrentDownloads: 3,
    maxConcurrentSegments: 5,
    maxConcurrentSegmentsPerHost: 3,
    maxBandwidthPerHostKBps: 0,
    defaultOutputFormat: 'auto',
    saveAsPrompt: true,
    preferredAudioLanguage: 'en',
    downloadSubtitles: false,
    notifyOnComplete: true,
    notifyOnError: true,
    historyRetentionDays: 30,
    namingTemplate: '{title}_{quality}_{date}_{time}',
    defaultActionPerHost: {},
    enableContextMenu: true,
    remoteConfigSecurityMode: 'strict',
    nativeHelperOnboardingDismissed: false,
    nativeHelperPermissionPrompted: false,
    nativeHelperLastReadiness: 'not-checked',
    enableNativeFeatures: true,
    enableBrowserFallbacks: true,
    useDirectToDisk: false,
    rememberOutputFolder: false,
    autoDeleteAfterSave: false,
    onboardingCompleted: false,
    uiLanguage: 'en',
  });
});

test('setAdvancedMode toggles the flag', () => {
  expect(useSettingsStore.getState().advancedMode).toBe(false);
  useSettingsStore.getState().setAdvancedMode(true);
  expect(useSettingsStore.getState().advancedMode).toBe(true);
});

test('supports disabling native features and browser fallbacks independently', () => {
  expect(useSettingsStore.getState().enableNativeFeatures).toBe(true);
  expect(useSettingsStore.getState().enableBrowserFallbacks).toBe(true);

  useSettingsStore.getState().setEnableNativeFeatures(false);
  useSettingsStore.getState().setEnableBrowserFallbacks(false);

  expect(useSettingsStore.getState().enableNativeFeatures).toBe(false);
  expect(useSettingsStore.getState().enableBrowserFallbacks).toBe(false);
});

test('supports direct-to-disk and cleanup settings independently', () => {
  useSettingsStore.getState().setUseDirectToDisk(true);
  useSettingsStore.getState().setRememberOutputFolder(true);
  useSettingsStore.getState().setAutoDeleteAfterSave(true);

  expect(useSettingsStore.getState().useDirectToDisk).toBe(true);
  expect(useSettingsStore.getState().rememberOutputFolder).toBe(true);
  expect(useSettingsStore.getState().autoDeleteAfterSave).toBe(true);
});

test('supports advanced command, regex, auto-download, and integration settings', () => {
  useSettingsStore.getState().setCustomCommandTemplate('yt-dlp "{url}"');
  useSettingsStore.getState().setCaptureRules({
    regexRules: [{ pattern: '\\.m3u8($|\\?)', category: 'hls_manifest' }],
  });
  useSettingsStore.getState().setAutoDownloadSettings({
    enabled: true,
    minSize: 4096,
    blacklist: ['*ads*'],
  });
  useSettingsStore.getState().setAria2Settings({
    enabled: true,
    rpcUrl: 'http://aria2.local/jsonrpc',
    secret: 'secret',
  });
  useSettingsStore.getState().setWebhookSettings({
    enabled: true,
    url: 'https://hook.example/notify',
  });
  useSettingsStore.getState().setExternalPlayerProfiles([
    { id: 'vlc', name: 'VLC', path: 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe' },
  ]);

  expect(useSettingsStore.getState()).toMatchObject({
    customCommandTemplate: 'yt-dlp "{url}"',
    captureRuleRegexRules: [{ pattern: '\\.m3u8($|\\?)', category: 'hls_manifest' }],
    autoDownloadEnabled: true,
    autoDownloadMinSize: 4096,
    autoDownloadBlacklist: ['*ads*'],
    aria2Enabled: true,
    aria2RpcUrl: 'http://aria2.local/jsonrpc',
    aria2Secret: 'secret',
    webhookEnabled: true,
    webhookUrl: 'https://hook.example/notify',
    externalPlayerProfiles: [
      { id: 'vlc', name: 'VLC', path: 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe' },
    ],
  });
});

test('setPreviousSessionLimit clamps to non-negative integer', () => {
  expect(useSettingsStore.getState().previousSessionLimit).toBe(50);
  useSettingsStore.getState().setPreviousSessionLimit(100);
  expect(useSettingsStore.getState().previousSessionLimit).toBe(100);
  useSettingsStore.getState().setPreviousSessionLimit(-5);
  expect(useSettingsStore.getState().previousSessionLimit).toBe(0);
});

test('supports theme and preview settings without changing UI structure', () => {
  useSettingsStore.getState().setTheme('dark');
  useSettingsStore.getState().setPreviewMode('video');

  expect(useSettingsStore.getState().theme).toBe('dark');
  expect(useSettingsStore.getState().previewMode).toBe('video');
});

test('supports native helper onboarding settings', () => {
  useSettingsStore.getState().setNativeHelperOnboardingDismissed(true);
  useSettingsStore.getState().setNativeHelperPermissionPrompted(true);
  useSettingsStore.getState().setNativeHelperLastReadiness('host-missing');
  useSettingsStore.getState().setOnboardingCompleted(true);
  useSettingsStore.getState().setUiLanguage('en');

  expect(useSettingsStore.getState()).toMatchObject({
    nativeHelperOnboardingDismissed: true,
    nativeHelperPermissionPrompted: true,
    nativeHelperLastReadiness: 'host-missing',
    onboardingCompleted: true,
    uiLanguage: 'en',
  });
});
