import { useSettingsStore } from '@/src/state/useSettingsStore';
import { NativeHelperStatus } from '@/src/ui/feedback/NativeHelperStatus';
import './PopupApp.css';

function SettingsContent() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
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
  const namingTemplate = useSettingsStore((s) => s.namingTemplate);
  const setNamingTemplate = useSettingsStore((s) => s.setNamingTemplate);
  const previewMode = useSettingsStore((s) => s.previewMode);
  const setPreviewMode = useSettingsStore((s) => s.setPreviewMode);
  const previewFormat = useSettingsStore((s) => s.previewFormat);
  const setPreviewFormat = useSettingsStore((s) => s.setPreviewFormat);
  const enableContextMenu = useSettingsStore((s) => s.enableContextMenu);
  const toggleContextMenu = useSettingsStore((s) => s.toggleContextMenu);

  return (
    <>
      <label className="popup__row">
        <span className="popup__label">Theme</span>
        <select
          aria-label="Theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value as Parameters<typeof setTheme>[0])}
          className="popup__select"
        >
          <option value="contrast">High Contrast</option>
          <option value="blueberry">Blueberry</option>
          <option value="lightdark">Light in the Dark</option>
          <option value="noirgold">Noir Gold</option>
          <option value="purplefanatic">Purple Fanatic</option>
          <option value="sakura">Sakura</option>
          <option value="ocean">Ocean</option>
          <option value="forest">Forest</option>
          <option value="slate">Slate</option>
          <option value="ember">Ember</option>
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
        <select
          aria-label="Preferred audio language"
          value={preferredAudioLanguage}
          onChange={(e) => setPreferredAudioLanguage(e.target.value)}
          className="popup__select"
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="ja">Japanese</option>
        </select>
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

      <NativeHelperStatus status="not-checked" />

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
    </>
  );
}

export function PopupApp({ embedded = false }: { embedded?: boolean }) {
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
      </footer>
    </div>
  );
}
