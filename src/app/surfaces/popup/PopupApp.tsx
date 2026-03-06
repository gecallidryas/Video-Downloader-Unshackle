import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createCaptureRuleEngine } from '@/src/core/capture-rules/capture-rule-engine';
import {
  createFileSystemAccessStore,
  persistOutputDirectoryHandle,
} from '@/src/core/storage/file-system-access-store';
import { requestNativeMessagingPermission } from '@/src/native/native-permissions';
import {
  checkNativeHelperReadiness,
  type NativeHelperDiagnostic,
  type NativeHelperReadiness,
} from '@/src/native/native-helper-diagnostics';
import { getNativeHelperInstallTarget } from '@/src/native/native-helper-links';
import {
  hydrateSettingsStore,
  useSettingsStore,
} from '@/src/state/useSettingsStore';
import { createRuntimeClient, type RuntimeClient } from '@/src/lib/runtime/client';
import { NativeHelperOnboarding } from '@/src/ui/onboarding/NativeHelperOnboarding';
import { LanguagePicker } from '@/src/ui/shared/LanguagePicker';
import type { RegexRule } from '@/src/core/capture-rules/regex-classifier';
import type { ExternalPlayerProfile } from '@/src/background/settings/settings-store';
import type { DownloadJob } from '@/video_downloader_types_skeleton';
import './PopupApp.css';

function linesToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function listToLines(value: string[]): string {
  return value.join('\n');
}

function createPopupDiagnostic(
  readiness: NativeHelperReadiness,
  message?: string,
): NativeHelperDiagnostic {
  return {
    readiness,
    permission:
      readiness === 'permission-needed'
        ? 'unknown'
        : readiness === 'permission-denied'
          ? 'denied'
          : 'granted',
    install:
      readiness === 'host-missing'
        ? 'missing'
        : readiness === 'host-forbidden'
          ? 'forbidden'
          : readiness === 'permission-needed' || readiness === 'permission-denied'
            ? 'unknown'
            : 'registered',
    ffmpeg:
      readiness === 'ffmpeg-missing'
        ? 'missing'
        : readiness === 'ready'
          ? 'available'
          : 'unknown',
    hostName: 'com.unshackle.ffmpeg',
    message,
    checkedAt: Date.now(),
  };
}

function resolveNativeHelperInstallTarget() {
  const runtimeId = typeof chrome === 'undefined' ? undefined : chrome.runtime?.id;
  const platform = typeof navigator === 'undefined' ? undefined : navigator.platform;
  const setupBaseUrl = import.meta.env.VITE_NATIVE_HELPER_SETUP_BASE_URL as string | undefined;

  return getNativeHelperInstallTarget({
    platform,
    setupBaseUrl,
    extensionId: runtimeId,
  });
}

const PROJECT_SOURCE_URL = 'https://github.com/gecallidryas/Video-Downloader-Unshackle';

function SettingsContent() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const setUiLanguage = useSettingsStore((s) => s.setUiLanguage);
  const nativeHelperOnboardingDismissed = useSettingsStore(
    (s) => s.nativeHelperOnboardingDismissed,
  );
  const setNativeHelperOnboardingDismissed = useSettingsStore(
    (s) => s.setNativeHelperOnboardingDismissed,
  );
  const setNativeHelperPermissionPrompted = useSettingsStore(
    (s) => s.setNativeHelperPermissionPrompted,
  );
  const nativeHelperLastReadiness = useSettingsStore((s) => s.nativeHelperLastReadiness);
  const setNativeHelperLastReadiness = useSettingsStore((s) => s.setNativeHelperLastReadiness);
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted);
  const setOnboardingCompleted = useSettingsStore((s) => s.setOnboardingCompleted);
  const [nativeHelperDiagnostic, setNativeHelperDiagnostic] =
    useState<NativeHelperDiagnostic>(() => createPopupDiagnostic(nativeHelperLastReadiness));
  const [nativeHelperBusy, setNativeHelperBusy] = useState(false);
  const mountedRef = useRef(false);
  const nativeHelperInstallTarget = resolveNativeHelperInstallTarget();
  const autoDetect = useSettingsStore((s) => s.autoDetectEnabled);
  const toggleAutoDetect = useSettingsStore((s) => s.toggleAutoDetect);
  const autoScanEnabled = useSettingsStore((s) => s.autoScanEnabled);
  const setAutoScanEnabled = useSettingsStore((s) => s.setAutoScanEnabled);
  const networkCaptureEnabled = useSettingsStore((s) => s.networkCaptureEnabled);
  const setNetworkCaptureEnabled = useSettingsStore((s) => s.setNetworkCaptureEnabled);
  const notifications = useSettingsStore((s) => s.notificationsEnabled);
  const toggleNotifications = useSettingsStore((s) => s.toggleNotifications);
  const preferredQuality = useSettingsStore((s) => s.preferredQuality);
  const setPreferredQuality = useSettingsStore((s) => s.setPreferredQuality);
  const maxConcurrentDownloads = useSettingsStore((s) => s.maxConcurrentDownloads);
  const setMaxConcurrentDownloads = useSettingsStore((s) => s.setMaxConcurrentDownloads);
  const maxConcurrentSegments = useSettingsStore((s) => s.maxConcurrentSegments);
  const setMaxConcurrentSegments = useSettingsStore((s) => s.setMaxConcurrentSegments);
  const defaultOutputFormat = useSettingsStore((s) => s.defaultOutputFormat);
  const setDefaultOutputFormat = useSettingsStore((s) => s.setDefaultOutputFormat);
  const preferredAudioLanguage = useSettingsStore((s) => s.preferredAudioLanguage);
  const setPreferredAudioLanguage = useSettingsStore((s) => s.setPreferredAudioLanguage);
  const customCommandTemplate = useSettingsStore((s) => s.customCommandTemplate);
  const setCustomCommandTemplate = useSettingsStore((s) => s.setCustomCommandTemplate);
  const namingTemplate = useSettingsStore((s) => s.namingTemplate);
  const setNamingTemplate = useSettingsStore((s) => s.setNamingTemplate);
  const previewMode = useSettingsStore((s) => s.previewMode);
  const setPreviewMode = useSettingsStore((s) => s.setPreviewMode);
  const previewFormat = useSettingsStore((s) => s.previewFormat);
  const setPreviewFormat = useSettingsStore((s) => s.setPreviewFormat);
  const enableContextMenu = useSettingsStore((s) => s.enableContextMenu);
  const toggleContextMenu = useSettingsStore((s) => s.toggleContextMenu);
  const advancedMode = useSettingsStore((s) => s.advancedMode);
  const setAdvancedMode = useSettingsStore((s) => s.setAdvancedMode);
  const enableNativeFeatures = useSettingsStore((s) => s.enableNativeFeatures);
  const setEnableNativeFeatures = useSettingsStore((s) => s.setEnableNativeFeatures);
  const enableBrowserFallbacks = useSettingsStore((s) => s.enableBrowserFallbacks);
  const setEnableBrowserFallbacks = useSettingsStore((s) => s.setEnableBrowserFallbacks);
  const browserTransmuxWithMuxJs = useSettingsStore((s) => s.browserTransmuxWithMuxJs);
  const setBrowserTransmuxWithMuxJs = useSettingsStore((s) => s.setBrowserTransmuxWithMuxJs);
  const browserTransmuxMaxBytes = useSettingsStore((s) => s.browserTransmuxMaxBytes);
  const setBrowserTransmuxMaxBytes = useSettingsStore((s) => s.setBrowserTransmuxMaxBytes);
  const useDirectToDisk = useSettingsStore((s) => s.useDirectToDisk);
  const setUseDirectToDisk = useSettingsStore((s) => s.setUseDirectToDisk);
  const rememberOutputFolder = useSettingsStore((s) => s.rememberOutputFolder);
  const setRememberOutputFolder = useSettingsStore((s) => s.setRememberOutputFolder);
  const autoDeleteAfterSave = useSettingsStore((s) => s.autoDeleteAfterSave);
  const setAutoDeleteAfterSave = useSettingsStore((s) => s.setAutoDeleteAfterSave);
  const previousSessionLimit = useSettingsStore((s) => s.previousSessionLimit);
  const setPreviousSessionLimit = useSettingsStore((s) => s.setPreviousSessionLimit);
  const captureRuleCustomExtensions = useSettingsStore((s) => s.captureRuleCustomExtensions);
  const captureRuleCustomContentTypes = useSettingsStore((s) => s.captureRuleCustomContentTypes);
  const captureRuleUrlBlacklist = useSettingsStore((s) => s.captureRuleUrlBlacklist);
  const captureRuleMinSizeBytes = useSettingsStore((s) => s.captureRuleMinSizeBytes);
  const captureRuleSizePredicate = useSettingsStore((s) => s.captureRuleSizePredicate);
  const captureRuleRegexRules = useSettingsStore((s) => s.captureRuleRegexRules);
  const setCaptureRules = useSettingsStore((s) => s.setCaptureRules);
  const resetCaptureRules = useSettingsStore((s) => s.resetCaptureRules);
  const autoDownloadEnabled = useSettingsStore((s) => s.autoDownloadEnabled);
  const autoDownloadMinSize = useSettingsStore((s) => s.autoDownloadMinSize);
  const autoDownloadBlacklist = useSettingsStore((s) => s.autoDownloadBlacklist);
  const setAutoDownloadSettings = useSettingsStore((s) => s.setAutoDownloadSettings);
  const aria2Enabled = useSettingsStore((s) => s.aria2Enabled);
  const aria2RpcUrl = useSettingsStore((s) => s.aria2RpcUrl);
  const aria2Secret = useSettingsStore((s) => s.aria2Secret);
  const setAria2Settings = useSettingsStore((s) => s.setAria2Settings);
  const webhookEnabled = useSettingsStore((s) => s.webhookEnabled);
  const webhookUrl = useSettingsStore((s) => s.webhookUrl);
  const setWebhookSettings = useSettingsStore((s) => s.setWebhookSettings);
  const externalPlayerProfiles = useSettingsStore((s) => s.externalPlayerProfiles);
  const setExternalPlayerProfiles = useSettingsStore((s) => s.setExternalPlayerProfiles);
  const [captureRulesJson, setCaptureRulesJson] = useState('');
  const [captureRulesError, setCaptureRulesError] = useState<string | null>(null);
  const [customExtensionsDraft, setCustomExtensionsDraft] = useState(
    listToLines(captureRuleCustomExtensions),
  );
  const [customContentTypesDraft, setCustomContentTypesDraft] = useState(
    listToLines(captureRuleCustomContentTypes),
  );
  const [urlBlacklistDraft, setUrlBlacklistDraft] = useState(
    listToLines(captureRuleUrlBlacklist),
  );
  const [sizePredicateDraft, setSizePredicateDraft] = useState(
    captureRuleSizePredicate,
  );
  const [regexRulesDraft, setRegexRulesDraft] = useState(
    JSON.stringify(captureRuleRegexRules, null, 2),
  );
  const [autoDownloadBlacklistDraft, setAutoDownloadBlacklistDraft] = useState(
    listToLines(autoDownloadBlacklist),
  );
  const [externalPlayerProfilesDraft, setExternalPlayerProfilesDraft] = useState(
    JSON.stringify(externalPlayerProfiles, null, 2),
  );

  async function refreshNativeHelperDiagnostic() {
    setNativeHelperBusy(true);
    try {
      const next = await checkNativeHelperReadiness();
      if (!mountedRef.current) {
        return;
      }
      setNativeHelperDiagnostic(next);
      setNativeHelperLastReadiness(next.readiness);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      const next = createPopupDiagnostic(
        'error',
        error instanceof Error ? error.message : 'Native helper failed.',
      );
      setNativeHelperDiagnostic(next);
      setNativeHelperLastReadiness(next.readiness);
    } finally {
      if (mountedRef.current) {
        setNativeHelperBusy(false);
      }
    }
  }

  async function enableNativeHelper() {
    setNativeHelperBusy(true);
    const granted = await requestNativeMessagingPermission();
    setNativeHelperPermissionPrompted(true);

    if (!granted) {
      const next = createPopupDiagnostic(
        'permission-denied',
        'Enable native helper access to use FFmpeg export.',
      );
      setNativeHelperDiagnostic(next);
      setNativeHelperLastReadiness(next.readiness);
      setNativeHelperBusy(false);
      return;
    }

    await refreshNativeHelperDiagnostic();
  }

  function openNativeHelperSetup() {
    window.open(nativeHelperInstallTarget.href, '_blank', 'noopener,noreferrer');
  }

  function openProjectSource() {
    window.open(PROJECT_SOURCE_URL, '_blank', 'noopener,noreferrer');
  }

  async function chooseOutputFolder() {
    const store = createFileSystemAccessStore({
      persistDirectoryHandle: persistOutputDirectoryHandle,
    });

    await store.chooseDirectory({
      userGesture: true,
      remember: rememberOutputFolder,
    });
  }

  function dismissOnboarding() {
    setNativeHelperOnboardingDismissed(true);
  }

  function completeOnboarding() {
    setOnboardingCompleted(true);
    setNativeHelperOnboardingDismissed(true);
  }

  useEffect(() => {
    mountedRef.current = true;
    void hydrateSettingsStore();
    void refreshNativeHelperDiagnostic();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  function updateCaptureRules(next: {
    customExtensions?: string[];
    customContentTypes?: string[];
    urlBlacklist?: string[];
    minSizeBytes?: number;
    sizePredicate?: string;
    regexRules?: RegexRule[];
  }) {
    const merged = {
      customExtensions: next.customExtensions ?? captureRuleCustomExtensions,
      customContentTypes: next.customContentTypes ?? captureRuleCustomContentTypes,
      blacklist: next.urlBlacklist ?? captureRuleUrlBlacklist,
      minSizeBytes: next.minSizeBytes ?? captureRuleMinSizeBytes,
      sizePredicate: next.sizePredicate ?? captureRuleSizePredicate,
      regexRules: next.regexRules ?? captureRuleRegexRules,
    };

    try {
      createCaptureRuleEngine(merged);
      setCaptureRules(next);
      setCaptureRulesError(null);
    } catch (error) {
      setCaptureRulesError(error instanceof Error ? error.message : 'Invalid capture rule');
    }
  }

  function exportCaptureRules() {
    setCaptureRulesJson(
      JSON.stringify(
        {
          customExtensions: captureRuleCustomExtensions,
          customContentTypes: captureRuleCustomContentTypes,
          urlBlacklist: captureRuleUrlBlacklist,
          minSizeBytes: captureRuleMinSizeBytes,
          sizePredicate: captureRuleSizePredicate,
          regexRules: captureRuleRegexRules,
        },
        null,
        2,
      ),
    );
    setCaptureRulesError(null);
  }

  function importCaptureRules() {
    try {
      const parsed = JSON.parse(captureRulesJson) as {
        customExtensions?: unknown;
        customContentTypes?: unknown;
        urlBlacklist?: unknown;
        minSizeBytes?: unknown;
        sizePredicate?: unknown;
        regexRules?: unknown;
      };
      const rules = {
        customExtensions: Array.isArray(parsed.customExtensions)
          ? parsed.customExtensions.filter((value): value is string => typeof value === 'string')
          : [],
        customContentTypes: Array.isArray(parsed.customContentTypes)
          ? parsed.customContentTypes.filter((value): value is string => typeof value === 'string')
          : [],
        urlBlacklist: Array.isArray(parsed.urlBlacklist)
          ? parsed.urlBlacklist.filter((value): value is string => typeof value === 'string')
          : [],
        minSizeBytes:
          typeof parsed.minSizeBytes === 'number' ? parsed.minSizeBytes : 0,
        sizePredicate:
          typeof parsed.sizePredicate === 'string' ? parsed.sizePredicate : '',
        regexRules: Array.isArray(parsed.regexRules)
          ? parsed.regexRules.filter((value): value is RegexRule =>
              typeof value === 'object' &&
              value !== null &&
              typeof (value as Partial<RegexRule>).pattern === 'string' &&
              typeof (value as Partial<RegexRule>).category === 'string',
            )
          : [],
      };

      createCaptureRuleEngine({
        customExtensions: rules.customExtensions,
        customContentTypes: rules.customContentTypes,
        blacklist: rules.urlBlacklist,
        minSizeBytes: rules.minSizeBytes,
        sizePredicate: rules.sizePredicate,
        regexRules: rules.regexRules,
      });
      setCaptureRules(rules);
      setCustomExtensionsDraft(listToLines(rules.customExtensions));
      setCustomContentTypesDraft(listToLines(rules.customContentTypes));
      setUrlBlacklistDraft(listToLines(rules.urlBlacklist));
      setSizePredicateDraft(rules.sizePredicate);
      setRegexRulesDraft(JSON.stringify(rules.regexRules, null, 2));
      setCaptureRulesError(null);
    } catch (error) {
      setCaptureRulesError(error instanceof Error ? error.message : 'Invalid capture rules JSON');
    }
  }

  return (
    <>
      {!onboardingCompleted && !nativeHelperOnboardingDismissed ? (
        <NativeHelperOnboarding
          diagnostic={nativeHelperDiagnostic}
          variant="first-run"
          theme={theme}
          language={uiLanguage}
          busy={nativeHelperBusy}
          onThemeChange={setTheme}
          onLanguageChange={setUiLanguage}
          onRequestPermission={() => void enableNativeHelper()}
          onCheckAgain={() => void refreshNativeHelperDiagnostic()}
          onOpenSetup={openNativeHelperSetup}
          onOpenSource={openProjectSource}
          onDismiss={dismissOnboarding}
          onComplete={completeOnboarding}
          nativeFeaturesEnabled={enableNativeFeatures}
          onNativeFeaturesChange={setEnableNativeFeatures}
          installTarget={nativeHelperInstallTarget}
        />
      ) : null}

      <label className="popup__row">
        <span className="popup__label">Theme</span>
        <select
          aria-label="Theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value as Parameters<typeof setTheme>[0])}
          className="popup__select"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>

      <label className="popup__row">
        <span className="popup__label">Auto-detect media</span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Auto-detect"
          checked={autoDetect}
          onChange={toggleAutoDetect}
          className="popup__toggle"
        />
      </label>

      <label className="popup__row">
        <span className="popup__label">Enable Auto-Scan</span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Enable Auto-Scan"
          checked={autoScanEnabled}
          onChange={(e) => setAutoScanEnabled(e.target.checked)}
          className="popup__toggle"
        />
      </label>

      <label className="popup__row">
        <span className="popup__label">Network capture</span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Network capture"
          checked={networkCaptureEnabled}
          onChange={(e) => setNetworkCaptureEnabled(e.target.checked)}
          className="popup__toggle"
        />
      </label>

      <label className="popup__row">
        <span className="popup__label">Download notifications</span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Notifications"
          checked={notifications}
          onChange={toggleNotifications}
          className="popup__toggle"
        />
      </label>

      <label className="popup__row">
        <span className="popup__label">Preferred quality</span>
        <select
          aria-label="Preferred quality"
          value={preferredQuality}
          onChange={(e) => setPreferredQuality(e.target.value as Parameters<typeof setPreferredQuality>[0])}
          className="popup__select"
        >
          <option value="highest">Highest quality</option>
          <option value="1080p">1080p</option>
          <option value="720p">720p</option>
          <option value="480p">480p</option>
          <option value="360p">360p</option>
          <option value="best">Best available</option>
          <option value="smallest">Smallest size</option>
          <option value="ask">Always ask</option>
        </select>
      </label>

      <label className="popup__row">
        <span className="popup__label">Max concurrent downloads</span>
        <select
          aria-label="Max concurrent downloads"
          value={String(maxConcurrentDownloads)}
          onChange={(e) => setMaxConcurrentDownloads(Number(e.target.value))}
          className="popup__select"
        >
          {[1, 2, 3, 5, 10].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label className="popup__row">
        <span className="popup__label">Segments per download</span>
        <select
          aria-label="Segments per download"
          value={String(maxConcurrentSegments)}
          onChange={(e) => setMaxConcurrentSegments(Number(e.target.value))}
          className="popup__select"
        >
          {[3, 5, 10, 15].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label className="popup__row">
        <span className="popup__label">Output format</span>
        <select
          aria-label="Output format"
          value={defaultOutputFormat}
          onChange={(e) => setDefaultOutputFormat(e.target.value as Parameters<typeof setDefaultOutputFormat>[0])}
          className="popup__select"
        >
          <option value="auto">Auto</option>
          <option value="mp4">MP4</option>
          <option value="mkv">MKV</option>
          <option value="mp3">MP3</option>
        </select>
      </label>

      <label className="popup__row">
        <span className="popup__label">Preferred audio language</span>
        <LanguagePicker
          id="preferred-audio-language"
          ariaLabel="Preferred audio language"
          value={preferredAudioLanguage}
          onChange={setPreferredAudioLanguage}
        />
      </label>

      <label className="popup__row popup__row--stack">
        <span className="popup__label">Custom command template</span>
        <textarea
          aria-label="Custom command template"
          value={customCommandTemplate}
          onChange={(event) => setCustomCommandTemplate(event.target.value)}
          className="popup__textarea"
          rows={2}
        />
      </label>

      <label className="popup__row popup__row--stack">
        <span className="popup__label">Filename template</span>
        <input
          aria-label="Filename template"
          value={namingTemplate}
          onChange={(e) => setNamingTemplate(e.target.value)}
          className="popup__input"
        />
      </label>

      <label className="popup__row">
        <span className="popup__label">Preview mode</span>
        <select
          aria-label="Preview mode"
          value={previewMode}
          onChange={(e) => setPreviewMode(e.target.value as Parameters<typeof setPreviewMode>[0])}
          className="popup__select"
        >
          <option value="none">None</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
      </label>

      <label className="popup__row">
        <span className="popup__label">Preview format</span>
        <select
          aria-label="Preview format"
          value={previewFormat}
          onChange={(e) => setPreviewFormat(e.target.value as Parameters<typeof setPreviewFormat>[0])}
          className="popup__select"
        >
          <option value="webm">WebM</option>
          <option value="mp4">MP4</option>
          <option value="gif">GIF</option>
        </select>
      </label>

      <label className="popup__row popup__row--with-help">
        <span>
          <span className="popup__label">Native FFmpeg features</span>
          <span className="popup__help">
            Uses native messaging for merged HLS/DASH, trims, and local FFmpeg output.
          </span>
        </span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Native FFmpeg features"
          checked={enableNativeFeatures}
          onChange={(event) => setEnableNativeFeatures(event.target.checked)}
          className="popup__toggle"
        />
      </label>

      <label className="popup__row popup__row--with-help">
        <span>
          <span className="popup__label">Browser fallbacks</span>
          <span className="popup__help">
            Allows HLS/DASH saves and browser-generated WebM preview or trim paths.
          </span>
        </span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Browser fallbacks"
          checked={enableBrowserFallbacks}
          onChange={(event) => setEnableBrowserFallbacks(event.target.checked)}
          className="popup__toggle"
        />
      </label>

      <label className="popup__row popup__row--with-help">
        <span>
          <span className="popup__label">mux.js HLS MP4 fallback</span>
          <span className="popup__help">
            Converts downloaded MPEG-TS HLS segments to MP4 in the browser when native export is unavailable.
          </span>
        </span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="mux.js HLS MP4 fallback"
          checked={browserTransmuxWithMuxJs}
          onChange={(event) => setBrowserTransmuxWithMuxJs(event.target.checked)}
          className="popup__toggle"
          disabled={!enableBrowserFallbacks}
        />
      </label>

      <label className="popup__row">
        <span className="popup__label">mux.js size limit (MB)</span>
        <input
          aria-label="mux.js size limit"
          type="number"
          min={1}
          value={Math.round(browserTransmuxMaxBytes / 1024 / 1024)}
          onChange={(event) =>
            setBrowserTransmuxMaxBytes(Number(event.target.value) * 1024 * 1024)
          }
          className="popup__input"
          disabled={!enableBrowserFallbacks || !browserTransmuxWithMuxJs}
        />
      </label>

      <label className="popup__row popup__row--with-help">
        <span>
          <span className="popup__label">Use direct-to-disk when available</span>
          <span className="popup__help">
            Streams supported exports into a user-selected folder instead of buffering in extension storage.
          </span>
        </span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Use direct-to-disk when available"
          checked={useDirectToDisk}
          onChange={(event) => setUseDirectToDisk(event.target.checked)}
          className="popup__toggle"
        />
      </label>

      <label className="popup__row popup__row--with-help">
        <span>
          <span className="popup__label">Remember output folder</span>
          <span className="popup__help">
            Reuses the granted File System Access folder when the browser allows persisted handles.
          </span>
        </span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Remember output folder"
          checked={rememberOutputFolder}
          onChange={(event) => setRememberOutputFolder(event.target.checked)}
          className="popup__toggle"
        />
      </label>

      <button
        type="button"
        className="popup__button"
        onClick={() => void chooseOutputFolder()}
      >
        Choose output folder
      </button>

      <label className="popup__row popup__row--with-help">
        <span>
          <span className="popup__label">Auto-delete fragments after save</span>
          <span className="popup__help">
            Removes temporary segment, subtitle, and metadata buckets after a completed download is saved.
          </span>
        </span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Auto-delete fragments after save"
          checked={autoDeleteAfterSave}
          onChange={(event) => setAutoDeleteAfterSave(event.target.checked)}
          className="popup__toggle"
        />
      </label>

      <label className="popup__row">
        <span className="popup__label">Context menu</span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Context menu"
          checked={enableContextMenu}
          onChange={toggleContextMenu}
          className="popup__toggle"
        />
      </label>

      <label className="popup__row">
        <span className="popup__label">Advanced mode</span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Advanced mode"
          checked={advancedMode}
          onChange={() => setAdvancedMode(!advancedMode)}
          className="popup__toggle"
        />
      </label>

      <label className="popup__row">
        <span className="popup__label">Previous session items limit</span>
        <select
          aria-label="Previous session limit"
          value={String(previousSessionLimit)}
          onChange={(e) => setPreviousSessionLimit(Number(e.target.value))}
          className="popup__select"
        >
          {[10, 25, 50, 100, 200, 0].map((value) => (
            <option key={value} value={value}>
              {value === 0 ? 'Unlimited' : value}
            </option>
          ))}
        </select>
      </label>

      <section className="capture-rules">
        <span className="popup__label">Capture rules</span>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">Custom extensions</span>
          <textarea
            aria-label="Custom extensions"
            value={customExtensionsDraft}
            onChange={(event) => {
              setCustomExtensionsDraft(event.target.value);
              updateCaptureRules({ customExtensions: linesToList(event.target.value) });
            }}
            className="popup__textarea"
            rows={2}
          />
        </label>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">Custom content types</span>
          <textarea
            aria-label="Custom content types"
            value={customContentTypesDraft}
            onChange={(event) => {
              setCustomContentTypesDraft(event.target.value);
              updateCaptureRules({ customContentTypes: linesToList(event.target.value) });
            }}
            className="popup__textarea"
            rows={2}
          />
        </label>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">URL blacklist</span>
          <textarea
            aria-label="URL blacklist"
            value={urlBlacklistDraft}
            onChange={(event) => {
              setUrlBlacklistDraft(event.target.value);
              updateCaptureRules({ urlBlacklist: linesToList(event.target.value) });
            }}
            className="popup__textarea"
            rows={2}
          />
        </label>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">Minimum size bytes</span>
          <input
            aria-label="Minimum size bytes"
            type="number"
            min={0}
            value={captureRuleMinSizeBytes}
            onChange={(event) =>
              updateCaptureRules({ minSizeBytes: Number(event.target.value) })
            }
            className="popup__input"
          />
        </label>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">Size predicate</span>
          <input
            aria-label="Size predicate"
            value={sizePredicateDraft}
            onChange={(event) => {
              setSizePredicateDraft(event.target.value);
              updateCaptureRules({ sizePredicate: event.target.value });
            }}
            className="popup__input"
          />
        </label>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">Regex classification rules</span>
          <textarea
            aria-label="Regex classification rules"
            value={regexRulesDraft}
            onChange={(event) => {
              setRegexRulesDraft(event.target.value);
              try {
                const parsed = JSON.parse(event.target.value) as RegexRule[];
                updateCaptureRules({ regexRules: parsed });
              } catch (error) {
                setCaptureRulesError(error instanceof Error ? error.message : 'Invalid regex rules JSON');
              }
            }}
            className="popup__textarea"
            rows={3}
          />
        </label>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">Capture rules JSON</span>
          <textarea
            aria-label="Capture rules JSON"
            value={captureRulesJson}
            onChange={(event) => setCaptureRulesJson(event.target.value)}
            className="popup__textarea"
            rows={3}
          />
        </label>
        {captureRulesError ? (
          <p className="capture-rules__error">{captureRulesError}</p>
        ) : null}
        <div className="capture-rules__actions">
          <button type="button" onClick={exportCaptureRules} className="capture-rules__button">
            Export capture rules
          </button>
          <button type="button" onClick={importCaptureRules} className="capture-rules__button">
            Import capture rules
          </button>
          <button
            type="button"
            onClick={() => {
              resetCaptureRules();
              setCustomExtensionsDraft('');
              setCustomContentTypesDraft('');
              setUrlBlacklistDraft('');
              setSizePredicateDraft('');
              setRegexRulesDraft('[]');
              setCaptureRulesError(null);
            }}
            className="capture-rules__button"
          >
            Reset capture rules
          </button>
        </div>
      </section>

      <section className="capture-rules">
        <span className="popup__label">Automation and integrations</span>
        <label className="popup__row">
          <span className="popup__label">Auto-download safe direct media</span>
          <input
            aria-label="Auto-download safe direct media"
            type="checkbox"
            role="checkbox"
            checked={autoDownloadEnabled}
            onChange={(event) => setAutoDownloadSettings({ enabled: event.target.checked })}
            className="popup__toggle"
          />
        </label>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">Auto-download minimum size</span>
          <input
            aria-label="Auto-download minimum size"
            type="number"
            min={0}
            value={autoDownloadMinSize}
            onChange={(event) => setAutoDownloadSettings({ minSize: Number(event.target.value) })}
            className="popup__input"
          />
        </label>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">Auto-download blacklist</span>
          <textarea
            aria-label="Auto-download blacklist"
            value={autoDownloadBlacklistDraft}
            onChange={(event) => {
              setAutoDownloadBlacklistDraft(event.target.value);
              setAutoDownloadSettings({ blacklist: linesToList(event.target.value) });
            }}
            className="popup__textarea"
            rows={2}
          />
        </label>
        <label className="popup__row">
          <span className="popup__label">Enable Aria2</span>
          <input
            aria-label="Enable Aria2"
            type="checkbox"
            role="checkbox"
            checked={aria2Enabled}
            onChange={(event) => setAria2Settings({ enabled: event.target.checked })}
            className="popup__toggle"
          />
        </label>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">Aria2 RPC URL</span>
          <input
            aria-label="Aria2 RPC URL"
            value={aria2RpcUrl}
            onChange={(event) => setAria2Settings({ rpcUrl: event.target.value })}
            className="popup__input"
          />
        </label>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">Aria2 secret</span>
          <input
            aria-label="Aria2 secret"
            type="password"
            value={aria2Secret}
            onChange={(event) => setAria2Settings({ secret: event.target.value })}
            className="popup__input"
          />
        </label>
        <label className="popup__row">
          <span className="popup__label">Enable webhook</span>
          <input
            aria-label="Enable webhook"
            type="checkbox"
            role="checkbox"
            checked={webhookEnabled}
            onChange={(event) => setWebhookSettings({ enabled: event.target.checked })}
            className="popup__toggle"
          />
        </label>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">Webhook URL</span>
          <input
            aria-label="Webhook URL"
            value={webhookUrl}
            onChange={(event) => setWebhookSettings({ url: event.target.value })}
            className="popup__input"
          />
        </label>
        <label className="popup__row popup__row--stack">
          <span className="popup__label">External player profiles JSON</span>
          <textarea
            aria-label="External player profiles JSON"
            value={externalPlayerProfilesDraft}
            onChange={(event) => {
              setExternalPlayerProfilesDraft(event.target.value);
              try {
                const parsed = JSON.parse(event.target.value) as ExternalPlayerProfile[];
                setExternalPlayerProfiles(parsed);
              } catch {
                // Keep the draft editable until valid JSON is supplied.
              }
            }}
            className="popup__textarea"
            rows={3}
          />
        </label>
      </section>
    </>
  );
}

export interface PopupJob {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  progressPct: number;
  segmentsDone?: number;
  segmentsFailed?: number;
  speedKBps?: number;
  elapsedSec?: number;
  error?: string;
}

interface PopupAppProps {
  embedded?: boolean;
  jobs?: PopupJob[];
  runtimeClient?: RuntimeClient;
  loadRuntimeJobs?: boolean;
}

function KeyboardHintFooter(): ReactNode {
  return (
    <ul aria-label="Keyboard shortcuts" className="popup__shortcuts" style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 11, opacity: 0.7 }}>
      <li>Pause all: Ctrl+Shift+P</li>
      <li>Clear completed: Ctrl+Shift+X</li>
      <li>Open side panel: Ctrl+Shift+D</li>
    </ul>
  );
}

function JobsList({ jobs, onSelect }: { jobs: PopupJob[]; onSelect: (id: string) => void }) {
  if (jobs.length === 0) {
    return <p className="popup__empty">No active downloads.</p>;
  }
  return (
    <ul aria-label="Download jobs" className="popup__jobs" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {jobs.map((job) => (
        <li key={job.id} style={{ borderBottom: '1px solid var(--outline-variant, #2a2a2a)' }}>
          <button
            type="button"
            className="popup__job"
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              color: 'inherit',
              border: 'none',
              padding: '8px 4px',
              cursor: 'pointer',
            }}
            onClick={() => onSelect(job.id)}
          >
            <strong>{job.title}</strong>
            <span style={{ marginLeft: 8, opacity: 0.7 }}>
              {job.status} · {Math.round(job.progressPct)}%
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function JobDetail({ job, onBack }: { job: PopupJob; onBack: () => void }) {
  return (
    <section aria-label={`Details for ${job.title}`}>
      <button type="button" onClick={onBack} aria-label="Back to job list">
        ← Back
      </button>
      <h2 style={{ fontSize: 14, margin: '8px 0' }}>{job.title}</h2>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12 }}>
        <dt>Progress</dt>
        <dd>{Math.round(job.progressPct)}%</dd>
        <dt>Status</dt>
        <dd>{job.status}</dd>
        {job.segmentsDone !== undefined ? (
          <>
            <dt>Segments done</dt>
            <dd>{job.segmentsDone}</dd>
          </>
        ) : null}
        {job.segmentsFailed !== undefined ? (
          <>
            <dt>Segments failed</dt>
            <dd>{job.segmentsFailed}</dd>
          </>
        ) : null}
        {job.speedKBps !== undefined ? (
          <>
            <dt>Speed</dt>
            <dd>{job.speedKBps.toFixed(1)} KB/s</dd>
          </>
        ) : null}
        {job.elapsedSec !== undefined ? (
          <>
            <dt>Elapsed</dt>
            <dd>{job.elapsedSec.toFixed(0)} s</dd>
          </>
        ) : null}
        {job.error ? (
          <>
            <dt>Error</dt>
            <dd role="alert">{job.error}</dd>
          </>
        ) : null}
      </dl>
    </section>
  );
}

function toPopupJob(job: DownloadJob): PopupJob {
  return {
    id: job.id,
    title: job.output?.fileName ?? job.candidateId,
    status:
      job.phase === 'completed'
        ? 'completed'
        : job.phase === 'failed' || job.phase === 'cancelled'
          ? 'failed'
          : job.phase === 'paused'
            ? 'paused'
            : job.phase === 'queued'
              ? 'pending'
              : 'running',
    progressPct: job.progressPct,
    segmentsDone: job.segmentStatuses?.filter((segment) => segment.status === 'done').length,
    segmentsFailed: job.segmentStatuses?.filter((segment) => segment.status === 'failed').length,
    error: job.failure?.message,
  };
}

export function PopupApp({
  embedded = false,
  jobs,
  runtimeClient,
  loadRuntimeJobs = false,
}: PopupAppProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [runtimeJobs, setRuntimeJobs] = useState<PopupJob[] | null>(null);
  const activeJobs = jobs ?? (loadRuntimeJobs ? runtimeJobs ?? [] : undefined);
  const selectedJob = activeJobs?.find((job) => job.id === selectedJobId) ?? null;

  useEffect(() => {
    if (!loadRuntimeJobs || embedded || jobs !== undefined) {
      return;
    }
    const client = runtimeClient ?? createRuntimeClient();
    let cancelled = false;
    void client.getJobs().then((downloadJobs) => {
      if (!cancelled) {
        setRuntimeJobs(downloadJobs.map(toPopupJob));
      }
    }).catch(() => {
      if (!cancelled) {
        setRuntimeJobs([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [embedded, jobs, loadRuntimeJobs, runtimeClient]);

  if (activeJobs !== undefined) {
    return (
      <div className="popup">
        <header className="popup__header">
          <h1 className="popup__title">Downloads</h1>
        </header>
        <div className="popup__body">
          {selectedJob ? (
            <JobDetail job={selectedJob} onBack={() => setSelectedJobId(null)} />
          ) : (
            <JobsList jobs={activeJobs} onSelect={setSelectedJobId} />
          )}
        </div>
        <footer className="popup__footer">
          <KeyboardHintFooter />
        </footer>
      </div>
    );
  }

  if (embedded) {
    return (
      <>
        <div className="side-panel__section-header">
          <span className="heading-caps">Settings</span>
        </div>
        <div className="popup__body">
          <SettingsContent />
        </div>
        <div className="popup__footer">
          <span className="popup__version">Video Downloader — Unshackle v0.1.0</span>
          <KeyboardHintFooter />
        </div>
      </>
    );
  }

  return (
    <div className="popup">
      <header className="popup__header">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M19.1 12.9a7.1 7.1 0 000-1.8l2-1.5a.5.5 0 00.1-.6l-1.9-3.3a.5.5 0 00-.6-.2l-2.3.9a6.7 6.7 0 00-1.6-.9l-.4-2.5a.5.5 0 00-.5-.4h-3.8a.5.5 0 00-.5.4l-.4 2.5a7 7 0 00-1.6.9L5.3 5.5a.5.5 0 00-.6.2L2.8 9a.5.5 0 00.1.6l2 1.5a7.2 7.2 0 000 1.8l-2 1.5a.5.5 0 00-.1.6l1.9 3.3a.5.5 0 00.6.2l2.3-.9c.5.4 1 .7 1.6.9l.4 2.5a.5.5 0 00.5.4h3.8a.5.5 0 00.5-.4l.4-2.5a7 7 0 001.6-.9l2.3.9a.5.5 0 00.6-.2l1.9-3.3a.5.5 0 00-.1-.6zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
        </svg>
        <h1 className="popup__title">Settings</h1>
      </header>
      <div className="popup__body">
        <SettingsContent />
      </div>
      <footer className="popup__footer">
        <span className="popup__version">Video Downloader — Unshackle v0.1.0</span>
        <KeyboardHintFooter />
      </footer>
    </div>
  );
}
