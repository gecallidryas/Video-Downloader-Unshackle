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
export type DefaultQualityPolicy = 'highest' | 'lowest' | 'ask';
export type OutputFormat = 'auto' | 'mp4' | 'mkv' | 'mp3' | 'webm';
export type ProviderContainerPreference = 'auto' | 'mp4' | 'webm' | 'm3u8' | 'mpd';
export type ProviderDashPairingPreference =
  | 'auto'
  | 'video-with-audio'
  | 'video-only'
  | 'audio-only';
export type RemoteConfigSecurityMode = 'strict' | 'warn' | 'disabled';
export type PreviewMode = 'none' | 'image' | 'video';
export type PreviewFormat = 'webm' | 'mp4' | 'gif';
export type DefaultDownloadAction =
  | 'download'
  | 'download_as'
  | 'download_audio'
  | 'copy'
  | 'record_live';
export type NotificationMode = 'each' | 'batched' | 'off';

export interface ProviderDefaultSettings {
  quality: PreferredQuality;
  container: ProviderContainerPreference;
  subtitles: boolean;
  dashPairing: ProviderDashPairingPreference;
}

export interface UnifiedSettings {
  theme: ThemeName;
  uiMode: UiMode;
  autoScanEnabled: boolean;
  networkCaptureEnabled: boolean;
  maxConcurrentDownloads: number;
  maxConcurrentSegments: number;
  maxConcurrentSegmentsPerHost: number;
  segmentTimeoutMs: number;
  maxBandwidthPerHostKBps: number;
  preferredQuality: PreferredQuality;
  defaultQualityPolicy: DefaultQualityPolicy;
  defaultOutputFormat: OutputFormat;
  providerDefaults: Record<string, ProviderDefaultSettings>;
  saveAsPrompt: boolean;
  preferredAudioLanguage: string;
  downloadSubtitles: boolean;
  showNotifications: boolean;
  notifyOnComplete: boolean;
  notifyOnError: boolean;
  notificationMode: NotificationMode;
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
  suppressProtectedDownloads: boolean;
  captureCredentialHeaders: boolean;
  captureRuleCustomExtensions: string[];
  captureRuleCustomContentTypes: string[];
  captureRuleUrlBlacklist: string[];
  captureRuleMinSizeBytes: number;
  captureRuleSizePredicate: string;
  advancedMode: boolean;
  autoDownloadEnabled: boolean;
  autoDownloadMinSize: number;
  autoDownloadBlacklist: string[];
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
  namingUseSiteRules: true,
  namingSiteRules: {},
  defaultAction: 'download',
  defaultActionPerHost: {},
  enableContextMenu: true,
  remoteConfigSecurityMode: 'strict',
  previewMode: 'image',
  previewFormat: 'webm',
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
    providerDefaults: Object.fromEntries(
      Object.entries(settings.providerDefaults).map(([providerId, defaults]) => [
        providerId,
        { ...defaults },
      ]),
    ),
    namingSiteRules: { ...settings.namingSiteRules },
    defaultActionPerHost: { ...settings.defaultActionPerHost },
    captureRuleCustomExtensions: [...settings.captureRuleCustomExtensions],
    captureRuleCustomContentTypes: [...settings.captureRuleCustomContentTypes],
    captureRuleUrlBlacklist: [...settings.captureRuleUrlBlacklist],
    autoDownloadBlacklist: [...settings.autoDownloadBlacklist],
  };
}

function normalizeProviderDefaults(
  value: unknown,
): Record<string, ProviderDefaultSettings> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, ProviderDefaultSettings> = {};

  for (const [providerId, defaults] of Object.entries(value)) {
    if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
      continue;
    }

    const item = defaults as Partial<ProviderDefaultSettings>;
    result[providerId] = {
      quality: ['highest', 'best', 'smallest', 'ask', '1080p', '720p', '480p', '360p'].includes(
        String(item.quality),
      )
        ? (item.quality as PreferredQuality)
        : DEFAULT_SETTINGS.preferredQuality,
      container: ['auto', 'mp4', 'webm', 'm3u8', 'mpd'].includes(
        String(item.container),
      )
        ? (item.container as ProviderContainerPreference)
        : 'auto',
      subtitles: Boolean(item.subtitles),
      dashPairing: [
        'auto',
        'video-with-audio',
        'video-only',
        'audio-only',
      ].includes(String(item.dashPairing))
        ? (item.dashPairing as ProviderDashPairingPreference)
        : 'auto',
    };
  }

  return result;
}

function normalizeSettings(value: unknown): UnifiedSettings {
  const incoming =
    typeof value === 'object' && value !== null
      ? (value as Partial<UnifiedSettings>)
      : {};

  return {
    ...DEFAULT_SETTINGS,
    ...incoming,
    providerDefaults: normalizeProviderDefaults(incoming.providerDefaults),
    namingSiteRules: { ...(incoming.namingSiteRules ?? {}) },
    defaultActionPerHost: { ...(incoming.defaultActionPerHost ?? {}) },
    captureRuleCustomExtensions: Array.isArray(incoming.captureRuleCustomExtensions)
      ? incoming.captureRuleCustomExtensions.filter((value): value is string => typeof value === 'string')
      : DEFAULT_SETTINGS.captureRuleCustomExtensions,
    captureRuleCustomContentTypes: Array.isArray(incoming.captureRuleCustomContentTypes)
      ? incoming.captureRuleCustomContentTypes.filter((value): value is string => typeof value === 'string')
      : DEFAULT_SETTINGS.captureRuleCustomContentTypes,
    captureRuleUrlBlacklist: Array.isArray(incoming.captureRuleUrlBlacklist)
      ? incoming.captureRuleUrlBlacklist.filter((value): value is string => typeof value === 'string')
      : DEFAULT_SETTINGS.captureRuleUrlBlacklist,
    captureRuleMinSizeBytes:
      Number.isInteger(incoming.captureRuleMinSizeBytes) &&
      Number(incoming.captureRuleMinSizeBytes) >= 0
        ? Number(incoming.captureRuleMinSizeBytes)
        : DEFAULT_SETTINGS.captureRuleMinSizeBytes,
    captureRuleSizePredicate:
      typeof incoming.captureRuleSizePredicate === 'string'
        ? incoming.captureRuleSizePredicate
        : DEFAULT_SETTINGS.captureRuleSizePredicate,
    remoteConfigSecurityMode: ['strict', 'warn', 'disabled'].includes(
      String(incoming.remoteConfigSecurityMode),
    )
      ? (incoming.remoteConfigSecurityMode as RemoteConfigSecurityMode)
      : DEFAULT_SETTINGS.remoteConfigSecurityMode,
    defaultQualityPolicy: ['highest', 'lowest', 'ask'].includes(
      String(incoming.defaultQualityPolicy),
    )
      ? (incoming.defaultQualityPolicy as DefaultQualityPolicy)
      : DEFAULT_SETTINGS.defaultQualityPolicy,
    notificationMode: ['each', 'batched', 'off'].includes(
      String(incoming.notificationMode),
    )
      ? (incoming.notificationMode as NotificationMode)
      : DEFAULT_SETTINGS.notificationMode,
    autoDownloadEnabled: typeof incoming.autoDownloadEnabled === 'boolean'
      ? incoming.autoDownloadEnabled
      : DEFAULT_SETTINGS.autoDownloadEnabled,
    autoDownloadMinSize:
      Number.isInteger(incoming.autoDownloadMinSize) &&
      Number(incoming.autoDownloadMinSize) >= 0
        ? Number(incoming.autoDownloadMinSize)
        : DEFAULT_SETTINGS.autoDownloadMinSize,
    autoDownloadBlacklist: Array.isArray(incoming.autoDownloadBlacklist)
      ? incoming.autoDownloadBlacklist.filter((value): value is string => typeof value === 'string')
      : DEFAULT_SETTINGS.autoDownloadBlacklist,
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
