import './BottomNav.css';

interface BottomNavProps {
  activeTab?: 'downloads' | 'current' | 'settings';
  onDownloadsClick?: () => void;
  onCurrentClick?: () => void;
  onSettingsClick?: () => void;
}

export function BottomNav({
  activeTab = 'current',
  onDownloadsClick,
  onCurrentClick,
  onSettingsClick,
}: BottomNavProps) {
  return (
    <nav className="bottom-nav">
      <button
        className={`bottom-nav__btn ${activeTab === 'downloads' ? 'bottom-nav__btn--active' : ''}`}
        aria-label="Downloads"
        onClick={onDownloadsClick}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
        </svg>
      </button>
      <button
        className={`bottom-nav__btn ${activeTab === 'current' ? 'bottom-nav__btn--active' : ''}`}
        aria-label="Current"
        onClick={onCurrentClick}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M20 6H12l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H6v-2l3-3 2 2 4-4 5 5v2h-6z" />
        </svg>
      </button>
      <button
        className={`bottom-nav__btn ${activeTab === 'settings' ? 'bottom-nav__btn--active' : ''}`}
        aria-label="Settings"
        onClick={onSettingsClick}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M19.1 12.9a7.1 7.1 0 000-1.8l2-1.5a.5.5 0 00.1-.6l-1.9-3.3a.5.5 0 00-.6-.2l-2.3.9a6.7 6.7 0 00-1.6-.9l-.4-2.5a.5.5 0 00-.5-.4h-3.8a.5.5 0 00-.5.4l-.4 2.5a7 7 0 00-1.6.9L5.3 5.5a.5.5 0 00-.6.2L2.8 9a.5.5 0 00.1.6l2 1.5a7.2 7.2 0 000 1.8l-2 1.5a.5.5 0 00-.1.6l1.9 3.3a.5.5 0 00.6.2l2.3-.9c.5.4 1 .7 1.6.9l.4 2.5a.5.5 0 00.5.4h3.8a.5.5 0 00.5-.4l.4-2.5a7 7 0 001.6-.9l2.3.9a.5.5 0 00.6-.2l1.9-3.3a.5.5 0 00-.1-.6zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
        </svg>
      </button>
    </nav>
  );
}
