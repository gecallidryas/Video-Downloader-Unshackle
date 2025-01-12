export const SETTINGS_STORAGE_KEY = 'unshackle_settings';

export type UiMode = 'side-panel' | 'popup';
export type ThemeName =
  | 'contrast'
  | 'blueberry'
  | 'lightdark'
  | 'noirgold'
  | 'purplefanatic'
  | 'sakura'
  | 'ocean'
  | 'forest'
  | 'slate'
  | 'ember'
  | 'light'
  | 'dark'
  | 'system';
export type PreferredQuality = 'highest' | 'best' | 'smallest' | 'ask' | '1080p' | '720p' | '480p' | '360p';
export type OutputFormat = 'auto' | 'mp4' | 'mkv' | 'mp3' | 'webm';
export type RemoteConfigSecurityMode = 'strict' | 'warn' | 'disabled';
export type PreviewMode = 'none' | 'image' | 'video';
export type DefaultDownloadAction =
  | 'download'
  | 'download_as'
  | 'download_audio'
  | 'copy'
  | 'record_live';

export interface UnifiedSettings {
  theme: ThemeName;
  uiMode: UiMode;
  autoScanEnabled: boolean;
  networkCaptureEnabled: boolean;
  maxConcurrentDownloads: number;
  maxConcurrentSegments: number;
  maxConcurrentSegmentsPerHost: number;
  maxBandwidthPerHostKBps: number;
  preferredQuality: PreferredQuality;
  defaultOutputFormat: OutputFormat;
  saveAsPrompt: boolean;
  preferredAudioLanguage: string;
  downloadSubtitles: boolean;
  showNotifications: boolean;
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
  _schemaVersion: number;
}

export const DEFAULT_SETTINGS: UnifiedSettings = {
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
  namingUseSiteRules: true,
  namingSiteRules: {},
  defaultAction: 'download',
  defaultActionPerHost: {},
  enableContextMenu: true,
  remoteConfigSecurityMode: 'strict',
  previewMode: 'image',
  _schemaVersion: 3,
};

export interface SettingsStorageAdapter {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
}

export interface SettingsStore {
  load(): Promise<UnifiedSettings>;
  getAll(): UnifiedSettings;
  get<TKey extends keyof UnifiedSettings>(key: TKey): UnifiedSettings[TKey];
  set<TKey extends keyof UnifiedSettings>(
    key: TKey,
    value: UnifiedSettings[TKey],
  ): Promise<UnifiedSettings>;
  setMany(updates: Partial<UnifiedSettings>): Promise<UnifiedSettings>;
  reset(): Promise<UnifiedSettings>;
}

function cloneSettings(settings: UnifiedSettings): UnifiedSettings {
  return {
    ...settings,
    namingSiteRules: { ...settings.namingSiteRules },
    defaultActionPerHost: { ...settings.defaultActionPerHost },
  };
}

function normalizeSettings(value: unknown): UnifiedSettings {
  const incoming =
    typeof value === 'object' && value !== null
      ? (value as Partial<UnifiedSettings>)
      : {};

  return {
    ...DEFAULT_SETTINGS,
    ...incoming,
    namingSiteRules: { ...(incoming.namingSiteRules ?? {}) },
    defaultActionPerHost: { ...(incoming.defaultActionPerHost ?? {}) },
    remoteConfigSecurityMode: ['strict', 'warn', 'disabled'].includes(
      String(incoming.remoteConfigSecurityMode),
    )
      ? (incoming.remoteConfigSecurityMode as RemoteConfigSecurityMode)
      : DEFAULT_SETTINGS.remoteConfigSecurityMode,
    _schemaVersion: DEFAULT_SETTINGS._schemaVersion,
  };
}

function defaultStorage(): SettingsStorageAdapter | undefined {
  return globalThis.chrome?.storage?.local;
}

export function createSettingsStore(options: {
  storage?: SettingsStorageAdapter;
} = {}): SettingsStore {
  const storage = options.storage ?? defaultStorage();
  let current = cloneSettings(DEFAULT_SETTINGS);

  async function persist(): Promise<void> {
    await storage?.set({ [SETTINGS_STORAGE_KEY]: cloneSettings(current) });
  }

  return {
    async load() {
      const stored = storage ? await storage.get(SETTINGS_STORAGE_KEY) : {};
      current = normalizeSettings(stored[SETTINGS_STORAGE_KEY]);

      return cloneSettings(current);
    },

    getAll() {
      return cloneSettings(current);
    },

    get(key) {
      return current[key];
    },

    async set(key, value) {
      current = normalizeSettings({ ...current, [key]: value });
      await persist();

      return cloneSettings(current);
    },

    async setMany(updates) {
      current = normalizeSettings({ ...current, ...updates });
      await persist();

      return cloneSettings(current);
    },

    async reset() {
      current = cloneSettings(DEFAULT_SETTINGS);
      await persist();

      return cloneSettings(current);
    },
  };
}
