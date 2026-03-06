import { create } from 'zustand';
import type {
  DefaultDownloadAction,
  OutputFormat,
  PreviewMode,
  PreviewFormat,
  PreferredQuality,
  RemoteConfigSecurityMode,
  ThemeName,
  UiLanguage,
  UiMode,
  ExternalPlayerProfile,
} from '@/src/background/settings/settings-store';
import type { RegexRule } from '@/src/core/capture-rules/regex-classifier';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  normalizeSettings,
  type SettingsStorageAdapter,
  type UnifiedSettings,
} from '@/src/background/settings/settings-store';
import type { NativeHelperReadiness } from '@/src/native/native-helper-diagnostics';

export interface SettingsState {
  theme: ThemeName;
  uiMode: UiMode;
  autoDetectEnabled: boolean;
  autoScanEnabled: boolean;
  networkCaptureEnabled: boolean;
  downloadPath: string;
  notificationsEnabled: boolean;
  showNotifications: boolean;
  preferredQuality: PreferredQuality;
  maxConcurrentDownloads: number;
  maxConcurrentSegments: number;
  maxConcurrentSegmentsPerHost: number;
  maxBandwidthPerHostKBps: number;
  defaultOutputFormat: OutputFormat;
  saveAsPrompt: boolean;
  preferredAudioLanguage: string;
  downloadSubtitles: boolean;
  notifyOnComplete: boolean;
  notifyOnError: boolean;
  historyRetentionDays: number;
  namingTemplate: string;
  namingUseSiteRules: boolean;
  namingSiteRules: Record<string, string>;
  defaultAction: DefaultDownloadAction;
  defaultActionPerHost: Record<string, DefaultDownloadAction>;
  enableContextMenu: boolean;
  remoteConfigSecurityMode: RemoteConfigSecurityMode;
  previewMode: PreviewMode;
  previewFormat: PreviewFormat;
  captureRuleCustomExtensions: string[];
  captureRuleCustomContentTypes: string[];
  captureRuleUrlBlacklist: string[];
  captureRuleMinSizeBytes: number;
  captureRuleSizePredicate: string;
  captureRuleRegexRules: RegexRule[];
  autoDownloadEnabled: boolean;
  autoDownloadMinSize: number;
  autoDownloadBlacklist: string[];
  customCommandTemplate: string;
  advancedMode: boolean;
  aria2Enabled: boolean;
  aria2RpcUrl: string;
  aria2Secret: string;
  webhookEnabled: boolean;
  webhookUrl: string;
  externalPlayerProfiles: ExternalPlayerProfile[];
  previousSessionLimit: number;
  enableNativeFeatures: boolean;
  enableBrowserFallbacks: boolean;
  browserTransmuxWithMuxJs: boolean;
  browserTransmuxMaxBytes: number;
  useDirectToDisk: boolean;
  rememberOutputFolder: boolean;
  autoDeleteAfterSave: boolean;
  nativeHelperOnboardingDismissed: boolean;
  nativeHelperPermissionPrompted: boolean;
  nativeHelperLastReadiness: NativeHelperReadiness;
  onboardingCompleted: boolean;
  uiLanguage: UiLanguage;
  setAdvancedMode: (enabled: boolean) => void;
  setPreviousSessionLimit: (limit: number) => void;
  setEnableNativeFeatures: (enabled: boolean) => void;
  setEnableBrowserFallbacks: (enabled: boolean) => void;
  setBrowserTransmuxWithMuxJs: (enabled: boolean) => void;
  setBrowserTransmuxMaxBytes: (value: number) => void;
  setUseDirectToDisk: (enabled: boolean) => void;
  setRememberOutputFolder: (enabled: boolean) => void;
  setAutoDeleteAfterSave: (enabled: boolean) => void;
  setNativeHelperOnboardingDismissed: (value: boolean) => void;
  setNativeHelperPermissionPrompted: (value: boolean) => void;
  setNativeHelperLastReadiness: (value: NativeHelperReadiness) => void;
  setOnboardingCompleted: (value: boolean) => void;
  setUiLanguage: (value: UiLanguage) => void;
  setTheme: (theme: ThemeName) => void;
  setAutoScanEnabled: (enabled: boolean) => void;
  setNetworkCaptureEnabled: (enabled: boolean) => void;
  setMaxConcurrentDownloads: (value: number) => void;
  setMaxConcurrentSegments: (value: number) => void;
  setPreferredAudioLanguage: (language: string) => void;
  setNamingTemplate: (template: string) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  setPreviewFormat: (format: PreviewFormat) => void;
  toggleAutoDetect: () => void;
  toggleNotifications: () => void;
  setDownloadPath: (path: string) => void;
  setPreferredQuality: (q: PreferredQuality) => void;
  setDefaultOutputFormat: (format: OutputFormat) => void;
  toggleContextMenu: () => void;
  setCaptureRules: (rules: {
    customExtensions?: string[];
    customContentTypes?: string[];
    urlBlacklist?: string[];
    minSizeBytes?: number;
    sizePredicate?: string;
    regexRules?: RegexRule[];
  }) => void;
  setCustomCommandTemplate: (template: string) => void;
  setAutoDownloadSettings: (settings: {
    enabled?: boolean;
    minSize?: number;
    blacklist?: string[];
  }) => void;
  setAria2Settings: (settings: {
    enabled?: boolean;
    rpcUrl?: string;
    secret?: string;
  }) => void;
  setWebhookSettings: (settings: { enabled?: boolean; url?: string }) => void;
  setExternalPlayerProfiles: (profiles: ExternalPlayerProfile[]) => void;
  resetCaptureRules: () => void;
}

type SettingsActionKey = {
  [K in keyof SettingsState]: SettingsState[K] extends (...args: never[]) => unknown ? K : never;
}[keyof SettingsState];

type PersistableSettingsState = Omit<SettingsState, SettingsActionKey>;
type SettingsStatePatch =
  | Partial<SettingsState>
  | ((state: SettingsState) => Partial<SettingsState>);

function defaultStorage(): SettingsStorageAdapter | undefined {
  return globalThis.chrome?.storage?.local;
}

function toStoredSettings(state: SettingsState): UnifiedSettings {
  const persistable = Object.fromEntries(
    Object.entries(state).filter(([, value]) => typeof value !== 'function'),
  ) as PersistableSettingsState;

  return normalizeSettings({
    ...persistable,
    showNotifications: state.notificationsEnabled,
    autoScanEnabled: state.autoScanEnabled,
  });
}

function persistSettingsState(state: SettingsState): void {
  void defaultStorage()?.set({
    [SETTINGS_STORAGE_KEY]: toStoredSettings(state),
  });
}

export async function hydrateSettingsStore(
  storage: SettingsStorageAdapter | undefined = defaultStorage(),
): Promise<void> {
  if (!storage) {
    return;
  }

  const stored = await storage.get(SETTINGS_STORAGE_KEY);
  if (!Object.prototype.hasOwnProperty.call(stored, SETTINGS_STORAGE_KEY)) {
    document.documentElement.setAttribute('data-theme', useSettingsStore.getState().theme);
    return;
  }

  const settings = normalizeSettings(stored[SETTINGS_STORAGE_KEY]);
  document.documentElement.setAttribute('data-theme', settings.theme);
  useSettingsStore.setState({
    ...settings,
    autoDetectEnabled: settings.autoScanEnabled,
    notificationsEnabled: settings.showNotifications,
  });
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const setPersisted = (patch: SettingsStatePatch) => {
    set(patch);
    persistSettingsState(get());
  };

  return {
    ...DEFAULT_SETTINGS,
    autoDetectEnabled: true,
    downloadPath: 'Downloads',
    notificationsEnabled: true,
    setTheme: (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      setPersisted({ theme });
    },
    setAutoScanEnabled: (enabled) =>
      setPersisted({ autoScanEnabled: enabled, autoDetectEnabled: enabled }),
    setNetworkCaptureEnabled: (enabled) => setPersisted({ networkCaptureEnabled: enabled }),
    setMaxConcurrentDownloads: (value) =>
      setPersisted({ maxConcurrentDownloads: Math.max(1, Math.floor(value)) }),
    setMaxConcurrentSegments: (value) =>
      setPersisted({ maxConcurrentSegments: Math.max(1, Math.floor(value)) }),
    setPreferredAudioLanguage: (language) => setPersisted({ preferredAudioLanguage: language }),
    setNamingTemplate: (template) => setPersisted({ namingTemplate: template }),
    setPreviewMode: (mode) => setPersisted({ previewMode: mode }),
    setPreviewFormat: (format) => setPersisted({ previewFormat: format }),
    toggleAutoDetect: () =>
      setPersisted((s) => ({
        autoDetectEnabled: !s.autoDetectEnabled,
        autoScanEnabled: !s.autoDetectEnabled,
      })),
    toggleNotifications: () =>
      setPersisted((s) => ({
        notificationsEnabled: !s.notificationsEnabled,
        showNotifications: !s.notificationsEnabled,
      })),
    setDownloadPath: (path) => setPersisted({ downloadPath: path }),
    setPreferredQuality: (q) => setPersisted({ preferredQuality: q }),
    setDefaultOutputFormat: (format) => setPersisted({ defaultOutputFormat: format }),
    toggleContextMenu: () =>
      setPersisted((s) => ({ enableContextMenu: !s.enableContextMenu })),
    setCaptureRules: (rules) =>
      setPersisted({
        ...(rules.customExtensions
          ? { captureRuleCustomExtensions: rules.customExtensions }
          : {}),
        ...(rules.customContentTypes
          ? { captureRuleCustomContentTypes: rules.customContentTypes }
          : {}),
        ...(rules.urlBlacklist ? { captureRuleUrlBlacklist: rules.urlBlacklist } : {}),
        ...(rules.minSizeBytes !== undefined
          ? { captureRuleMinSizeBytes: Math.max(0, Math.floor(rules.minSizeBytes)) }
          : {}),
        ...(rules.sizePredicate !== undefined
          ? { captureRuleSizePredicate: rules.sizePredicate }
          : {}),
        ...(rules.regexRules !== undefined
          ? { captureRuleRegexRules: rules.regexRules.map((rule) => ({ ...rule })) }
          : {}),
      }),
    setCustomCommandTemplate: (template) => setPersisted({ customCommandTemplate: template }),
    setAutoDownloadSettings: (settings) =>
      setPersisted({
        ...(settings.enabled !== undefined ? { autoDownloadEnabled: settings.enabled } : {}),
        ...(settings.minSize !== undefined
          ? { autoDownloadMinSize: Math.max(0, Math.floor(settings.minSize)) }
          : {}),
        ...(settings.blacklist !== undefined
          ? { autoDownloadBlacklist: settings.blacklist }
          : {}),
      }),
    setAria2Settings: (settings) =>
      setPersisted({
        ...(settings.enabled !== undefined ? { aria2Enabled: settings.enabled } : {}),
        ...(settings.rpcUrl !== undefined ? { aria2RpcUrl: settings.rpcUrl } : {}),
        ...(settings.secret !== undefined ? { aria2Secret: settings.secret } : {}),
      }),
    setWebhookSettings: (settings) =>
      setPersisted({
        ...(settings.enabled !== undefined ? { webhookEnabled: settings.enabled } : {}),
        ...(settings.url !== undefined ? { webhookUrl: settings.url } : {}),
      }),
    setExternalPlayerProfiles: (profiles) =>
      setPersisted({ externalPlayerProfiles: profiles.map((profile) => ({ ...profile })) }),
    setAdvancedMode: (enabled) => setPersisted({ advancedMode: enabled }),
    setPreviousSessionLimit: (limit) =>
      setPersisted({ previousSessionLimit: Math.max(0, Math.floor(limit)) }),
    setEnableNativeFeatures: (enabled) => setPersisted({ enableNativeFeatures: enabled }),
    setEnableBrowserFallbacks: (enabled) => setPersisted({ enableBrowserFallbacks: enabled }),
    setBrowserTransmuxWithMuxJs: (enabled) => setPersisted({ browserTransmuxWithMuxJs: enabled }),
    setBrowserTransmuxMaxBytes: (value) =>
      setPersisted({ browserTransmuxMaxBytes: Math.max(1, Math.floor(value)) }),
    setUseDirectToDisk: (enabled) => setPersisted({ useDirectToDisk: enabled }),
    setRememberOutputFolder: (enabled) => setPersisted({ rememberOutputFolder: enabled }),
    setAutoDeleteAfterSave: (enabled) => setPersisted({ autoDeleteAfterSave: enabled }),
    setNativeHelperOnboardingDismissed: (value) =>
      setPersisted({ nativeHelperOnboardingDismissed: value }),
    setNativeHelperPermissionPrompted: (value) =>
      setPersisted({ nativeHelperPermissionPrompted: value }),
    setNativeHelperLastReadiness: (value) => setPersisted({ nativeHelperLastReadiness: value }),
    setOnboardingCompleted: (value) => setPersisted({ onboardingCompleted: value }),
    setUiLanguage: (value) => setPersisted({ uiLanguage: value }),
    resetCaptureRules: () =>
      setPersisted({
        captureRuleCustomExtensions: [],
        captureRuleCustomContentTypes: [],
        captureRuleUrlBlacklist: [],
        captureRuleMinSizeBytes: 0,
        captureRuleSizePredicate: '',
        captureRuleRegexRules: [],
      }),
  };
});
