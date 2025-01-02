import { useSettingsStore } from '@/src/state/useSettingsStore';
import './PopupApp.css';

function SettingsContent() {
  const autoDetect = useSettingsStore((s) => s.autoDetectEnabled);
  const toggleAutoDetect = useSettingsStore((s) => s.toggleAutoDetect);
  const notifications = useSettingsStore((s) => s.notificationsEnabled);
  const toggleNotifications = useSettingsStore((s) => s.toggleNotifications);
  const preferredQuality = useSettingsStore((s) => s.preferredQuality);
  const setPreferredQuality = useSettingsStore((s) => s.setPreferredQuality);

  return (
    <>
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
          onChange={(e) => setPreferredQuality(e.target.value as 'best' | 'smallest' | 'ask')}
          className="popup__select"
        >
          <option value="best">Best available</option>
          <option value="smallest">Smallest size</option>
          <option value="ask">Always ask</option>
        </select>
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
