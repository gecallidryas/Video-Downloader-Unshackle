import type { NativeHelperReadiness } from '@/src/native/native-helper-diagnostics';
import type { RegexRule } from '@/src/core/capture-rules/regex-classifier';

export const SETTINGS_STORAGE_KEY = 'unshackle_settings';

export type UiMode = 'side-panel' | 'popup';
export type ThemeName = 'dark' | 'light';
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
export type UiLanguage = 'en';
export type YtDlpQualityPreference = 'best-mp4' | 'best' | 'smallest' | 'audio';
export type YtDlpSubtitlePreference = 'none' | 'embed' | 'sidecar' | 'both';

export interface ProviderDefaultSettings {
  quality: PreferredQuality;
  container: ProviderContainerPreference;
  subtitles: boolean;
  dashPairing: ProviderDashPairingPreference;
}

export interface ExternalPlayerProfile {
  id: string;
  name: string;
  path: string;
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
  // Single user-facing front door for credential capture + replay. When true,
  // captured Cookie/Authorization are reused on downloads from logged-in sites
  // (browser DNR header replay + engine handoff), without requiring advancedMode.
  downloadFromLoggedInSites: boolean;
  captureRuleCustomExtensions: string[];
  captureRuleCustomContentTypes: string[];
  captureRuleUrlBlacklist: string[];
  captureRuleMinSizeBytes: number;
  captureRuleSizePredicate: string;
  captureRuleRegexRules: RegexRule[];
  advancedMode: boolean;
  autoDownloadEnabled: boolean;
  autoDownloadMinSize: number;
  autoDownloadBlacklist: string[];
  customCommandTemplate: string;
  aria2Enabled: boolean;
  aria2RpcUrl: string;
  aria2Secret: string;
  webhookEnabled: boolean;
  webhookUrl: string;
  previousSessionLimit: number;
  externalPlayerProfiles: ExternalPlayerProfile[];
  enableNativeFeatures: boolean;
  useNativeFfmpeg: boolean;
  useNativeYtDlp: boolean;
  ytDlpDefaultQuality: YtDlpQualityPreference;
  ytDlpDefaultSubtitles: YtDlpSubtitlePreference;
  ytDlpBinaryPath: string;
  ytDlpCustomArgs: string;
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
  _schemaVersion: number;
}

export const DEFAULT_SETTINGS: UnifiedSettings = {
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
  downloadFromLoggedInSites: false,
  captureRuleCustomExtensions: [],
  captureRuleCustomContentTypes: [],
  captureRuleUrlBlacklist: [],
  captureRuleMinSizeBytes: 0,
  captureRuleSizePredicate: '',
  captureRuleRegexRules: [],
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
  enableNativeFeatures: true,
  useNativeFfmpeg: true,
  useNativeYtDlp: true,
  ytDlpDefaultQuality: 'best-mp4',
  ytDlpDefaultSubtitles: 'none',
  ytDlpBinaryPath: '',
  ytDlpCustomArgs: '',
  enableBrowserFallbacks: true,
  browserTransmuxWithMuxJs: true,
  browserTransmuxMaxBytes: 150 * 1024 * 1024,
  useDirectToDisk: false,
  rememberOutputFolder: false,
  autoDeleteAfterSave: false,
  nativeHelperOnboardingDismissed: false,
  nativeHelperPermissionPrompted: false,
  nativeHelperLastReadiness: 'not-checked',
  onboardingCompleted: false,
  uiLanguage: 'en',
  _schemaVersion: 18,
};

const nativeHelperReadinessValues = new Set<NativeHelperReadiness>([
  'not-checked',
  'permission-needed',
  'permission-denied',
  'host-missing',
  'host-forbidden',
  'ffmpeg-missing',
  'ready',
  'error',
]);

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
    captureRuleRegexRules: settings.captureRuleRegexRules.map((rule) => ({ ...rule })),
    autoDownloadBlacklist: [...settings.autoDownloadBlacklist],
    externalPlayerProfiles: settings.externalPlayerProfiles.map((profile) => ({ ...profile })),
  };
}

function normalizeExternalPlayerProfiles(value: unknown): ExternalPlayerProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: ExternalPlayerProfile[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Partial<ExternalPlayerProfile>;
    if (
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.path === 'string'
    ) {
      result.push({ id: item.id, name: item.name, path: item.path });
    }
  }
  return result;
}

function normalizeRegexRules(value: unknown): RegexRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Partial<RegexRule> =>
      typeof entry === 'object' && entry !== null,
    )
    .flatMap((entry) =>
      typeof entry.pattern === 'string' && typeof entry.category === 'string'
        ? [{ pattern: entry.pattern, category: entry.category }]
        : [],
    );
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

export function normalizeSettings(value: unknown): UnifiedSettings {
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
    captureRuleRegexRules: normalizeRegexRules(incoming.captureRuleRegexRules),
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
    customCommandTemplate:
      typeof incoming.customCommandTemplate === 'string'
        ? incoming.customCommandTemplate
        : DEFAULT_SETTINGS.customCommandTemplate,
    aria2Enabled: typeof incoming.aria2Enabled === 'boolean'
      ? incoming.aria2Enabled
      : DEFAULT_SETTINGS.aria2Enabled,
    aria2RpcUrl:
      typeof incoming.aria2RpcUrl === 'string' && incoming.aria2RpcUrl.length > 0
        ? incoming.aria2RpcUrl
        : DEFAULT_SETTINGS.aria2RpcUrl,
    aria2Secret:
      typeof incoming.aria2Secret === 'string'
        ? incoming.aria2Secret
        : DEFAULT_SETTINGS.aria2Secret,
    webhookEnabled: typeof incoming.webhookEnabled === 'boolean'
      ? incoming.webhookEnabled
      : DEFAULT_SETTINGS.webhookEnabled,
    webhookUrl:
      typeof incoming.webhookUrl === 'string'
        ? incoming.webhookUrl
        : DEFAULT_SETTINGS.webhookUrl,
    previousSessionLimit:
      Number.isInteger(incoming.previousSessionLimit) &&
      Number(incoming.previousSessionLimit) >= 0
        ? Number(incoming.previousSessionLimit)
        : DEFAULT_SETTINGS.previousSessionLimit,
    externalPlayerProfiles: normalizeExternalPlayerProfiles(incoming.externalPlayerProfiles),
    enableNativeFeatures:
      typeof incoming.enableNativeFeatures === 'boolean'
        ? incoming.enableNativeFeatures
        : DEFAULT_SETTINGS.enableNativeFeatures,
    useNativeFfmpeg:
      typeof incoming.useNativeFfmpeg === 'boolean'
        ? incoming.useNativeFfmpeg
        : DEFAULT_SETTINGS.useNativeFfmpeg,
    useNativeYtDlp:
      typeof incoming.useNativeYtDlp === 'boolean'
        ? incoming.useNativeYtDlp
        : DEFAULT_SETTINGS.useNativeYtDlp,
    ytDlpDefaultQuality: ['best-mp4', 'best', 'smallest', 'audio'].includes(
      String(incoming.ytDlpDefaultQuality),
    )
      ? (incoming.ytDlpDefaultQuality as YtDlpQualityPreference)
      : DEFAULT_SETTINGS.ytDlpDefaultQuality,
    ytDlpDefaultSubtitles: ['none', 'embed', 'sidecar', 'both'].includes(
      String(incoming.ytDlpDefaultSubtitles),
    )
      ? (incoming.ytDlpDefaultSubtitles as YtDlpSubtitlePreference)
      : DEFAULT_SETTINGS.ytDlpDefaultSubtitles,
    ytDlpBinaryPath:
      typeof incoming.ytDlpBinaryPath === 'string' && !/[\r\n\0]/.test(incoming.ytDlpBinaryPath)
        ? incoming.ytDlpBinaryPath.trim()
        : DEFAULT_SETTINGS.ytDlpBinaryPath,
    ytDlpCustomArgs:
      typeof incoming.ytDlpCustomArgs === 'string' && !/[\r\n\0]/.test(incoming.ytDlpCustomArgs)
        ? incoming.ytDlpCustomArgs
        : DEFAULT_SETTINGS.ytDlpCustomArgs,
    enableBrowserFallbacks:
      typeof incoming.enableBrowserFallbacks === 'boolean'
        ? incoming.enableBrowserFallbacks
        : DEFAULT_SETTINGS.enableBrowserFallbacks,
    browserTransmuxWithMuxJs:
      typeof incoming.browserTransmuxWithMuxJs === 'boolean'
        ? incoming.browserTransmuxWithMuxJs
        : DEFAULT_SETTINGS.browserTransmuxWithMuxJs,
    browserTransmuxMaxBytes:
      Number.isInteger(incoming.browserTransmuxMaxBytes) &&
      Number(incoming.browserTransmuxMaxBytes) > 0
        ? Number(incoming.browserTransmuxMaxBytes)
        : DEFAULT_SETTINGS.browserTransmuxMaxBytes,
    useDirectToDisk:
      typeof incoming.useDirectToDisk === 'boolean'
        ? incoming.useDirectToDisk
        : DEFAULT_SETTINGS.useDirectToDisk,
    rememberOutputFolder:
      typeof incoming.rememberOutputFolder === 'boolean'
        ? incoming.rememberOutputFolder
        : DEFAULT_SETTINGS.rememberOutputFolder,
    autoDeleteAfterSave:
      typeof incoming.autoDeleteAfterSave === 'boolean'
        ? incoming.autoDeleteAfterSave
        : DEFAULT_SETTINGS.autoDeleteAfterSave,
    nativeHelperOnboardingDismissed:
      typeof incoming.nativeHelperOnboardingDismissed === 'boolean'
        ? incoming.nativeHelperOnboardingDismissed
        : DEFAULT_SETTINGS.nativeHelperOnboardingDismissed,
    nativeHelperPermissionPrompted:
      typeof incoming.nativeHelperPermissionPrompted === 'boolean'
        ? incoming.nativeHelperPermissionPrompted
        : DEFAULT_SETTINGS.nativeHelperPermissionPrompted,
    nativeHelperLastReadiness: nativeHelperReadinessValues.has(
      incoming.nativeHelperLastReadiness as NativeHelperReadiness,
    )
      ? (incoming.nativeHelperLastReadiness as NativeHelperReadiness)
      : DEFAULT_SETTINGS.nativeHelperLastReadiness,
    onboardingCompleted:
      typeof incoming.onboardingCompleted === 'boolean'
        ? incoming.onboardingCompleted
        : DEFAULT_SETTINGS.onboardingCompleted,
    uiLanguage: incoming.uiLanguage === 'en' ? 'en' : DEFAULT_SETTINGS.uiLanguage,
    _schemaVersion: DEFAULT_SETTINGS._schemaVersion,
  };
}

// Effective credential capture/replay gate. The single `downloadFromLoggedInSites`
// toggle is the user-facing front door; the legacy advancedMode + captureCredentialHeaders
// combination still works for power users who configured it directly.
export function credentialReplayEnabled(
  settings: Pick<
    UnifiedSettings,
    'downloadFromLoggedInSites' | 'advancedMode' | 'captureCredentialHeaders'
  >,
): boolean {
  return (
    settings.downloadFromLoggedInSites === true ||
    (settings.advancedMode === true && settings.captureCredentialHeaders === true)
  );
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
