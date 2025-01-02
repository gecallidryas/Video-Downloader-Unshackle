import './PanelHeader.css';

export function PanelHeader() {
  return (
    <header className="panel-header">
      <svg
        className="panel-header__icon"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="currentColor"
      >
        <path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm-1 14.5v-9l6 4.5z" />
      </svg>
      <h1 className="panel-header__title">Video Downloader</h1>
    </header>
  );
}
