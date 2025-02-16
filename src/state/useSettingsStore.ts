import { create } from 'zustand';
import type {
  DefaultDownloadAction,
  OutputFormat,
  PreviewMode,
  PreviewFormat,
  PreferredQuality,
  RemoteConfigSecurityMode,
  ThemeName,
  UiMode,
} from '@/src/background/settings/settings-store';
import { DEFAULT_SETTINGS } from '@/src/background/settings/settings-store';

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
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,
  autoDetectEnabled: true,
  downloadPath: 'Downloads',
  notificationsEnabled: true,
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  setAutoScanEnabled: (enabled) =>
    set({ autoScanEnabled: enabled, autoDetectEnabled: enabled }),
  setNetworkCaptureEnabled: (enabled) => set({ networkCaptureEnabled: enabled }),
  setMaxConcurrentDownloads: (value) =>
    set({ maxConcurrentDownloads: Math.max(1, Math.floor(value)) }),
  setMaxConcurrentSegments: (value) =>
    set({ maxConcurrentSegments: Math.max(1, Math.floor(value)) }),
  setPreferredAudioLanguage: (language) => set({ preferredAudioLanguage: language }),
  setNamingTemplate: (template) => set({ namingTemplate: template }),
  setPreviewMode: (mode) => set({ previewMode: mode }),
  setPreviewFormat: (format) => set({ previewFormat: format }),
  toggleAutoDetect: () =>
    set((s) => ({
      autoDetectEnabled: !s.autoDetectEnabled,
      autoScanEnabled: !s.autoDetectEnabled,
    })),
  toggleNotifications: () =>
    set((s) => ({
      notificationsEnabled: !s.notificationsEnabled,
      showNotifications: !s.notificationsEnabled,
    })),
  setDownloadPath: (path) => set({ downloadPath: path }),
  setPreferredQuality: (q) => set({ preferredQuality: q }),
  setDefaultOutputFormat: (format) => set({ defaultOutputFormat: format }),
  toggleContextMenu: () =>
    set((s) => ({ enableContextMenu: !s.enableContextMenu })),
}));
