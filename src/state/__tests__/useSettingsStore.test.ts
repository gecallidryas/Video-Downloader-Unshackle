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
  });
});

test('setAdvancedMode toggles the flag', () => {
  expect(useSettingsStore.getState().advancedMode).toBe(false);
  useSettingsStore.getState().setAdvancedMode(true);
  expect(useSettingsStore.getState().advancedMode).toBe(true);
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
