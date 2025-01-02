import { useSettingsStore } from '@/src/state/useSettingsStore';

beforeEach(() => {
  useSettingsStore.setState({
    autoDetectEnabled: true,
    downloadPath: 'Downloads',
    notificationsEnabled: true,
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
