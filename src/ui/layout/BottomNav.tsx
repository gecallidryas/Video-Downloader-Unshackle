import './BottomNav.css';

interface BottomNavProps {
  activeTab?: 'history' | 'current' | 'settings';
  onHistoryClick?: () => void;
  onCurrentClick?: () => void;
  onSettingsClick?: () => void;
}

export function BottomNav({
  activeTab = 'current',
  onHistoryClick,
  onCurrentClick,
  onSettingsClick,
}: BottomNavProps) {
  return (
    <nav className="bottom-nav">
      <button
        className={`bottom-nav__btn ${activeTab === 'history' ? 'bottom-nav__btn--active' : ''}`}
        aria-label="History"
        onClick={onHistoryClick}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M13 3a9 9 0 00-9 9H1l3.9 3.9.1.1L9 12H6c0-3.9 3.1-7 7-7s7 3.1 7 7-3.1 7-7 7a6.9 6.9 0 01-5-2.1l-1.4 1.4A8.9 8.9 0 0013 21a9 9 0 000-18zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8z" />
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
