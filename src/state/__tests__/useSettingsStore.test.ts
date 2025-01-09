import { useSettingsStore } from '@/src/state/useSettingsStore';

beforeEach(() => {
  useSettingsStore.setState({
    autoDetectEnabled: true,
    autoScanEnabled: true,
    downloadPath: 'Downloads',
    notificationsEnabled: true,
    showNotifications: true,
    preferredQuality: 'best',
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
    theme: 'contrast',
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
  });
});

test('supports source theme choices and preview settings without changing UI structure', () => {
  useSettingsStore.getState().setTheme('forest');
  useSettingsStore.getState().setPreviewMode('video');

  expect(useSettingsStore.getState().theme).toBe('forest');
  expect(useSettingsStore.getState().previewMode).toBe('video');
});
