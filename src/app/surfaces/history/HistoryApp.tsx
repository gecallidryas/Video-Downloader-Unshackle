import { useHistoryStore } from '@/src/state/useHistoryStore';
import './HistoryApp.css';

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${(bytes / 1_000).toFixed(0)} KB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'history-row__status--completed';
    case 'failed':
      return 'history-row__status--failed';
    case 'cancelled':
      return 'history-row__status--cancelled';
    default:
      return '';
  }
}

function HistoryContent({ records }: { records: ReturnType<typeof useHistoryStore.getState>['records'] }) {
  if (records.length === 0) {
    return (
      <div className="history__empty">
        <p>No downloads yet</p>
        <p className="history__empty-sub">Downloaded media will appear here</p>
      </div>
    );
  }

  return (
    <div className="history__list">
      {records.map((record) => (
        <div key={record.id} className="history-row">
          <div className="history-row__top">
            <div className="history-row__icon-area">
              {record.mediaKind === 'audio' ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M12 3v10.6A3.5 3.5 0 1014 17V7h4V3z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
                  <path d="M17 10l5 4-5 4z" />
                </svg>
              )}
            </div>
            <div className="history-row__info">
              <span className="history-row__name truncate" title={record.displayName}>
                {record.displayName}
              </span>
              <div className="history-row__meta">
                <span className="history-row__chip">{record.protocol.toUpperCase()}</span>
                <span className={`history-row__status ${statusClass(record.status)}`}>
                  {record.status}
                </span>
                {record.fileSizeBytes && (
                  <span className="history-row__size label-xs">
                    {formatBytes(record.fileSizeBytes)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="history-row__bottom">
            <span className="history-row__source label-xs truncate" title={record.pageTitle}>
              {record.pageTitle}
            </span>
            <span className="history-row__date label-xs">
              {formatDate(record.createdAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function HistoryApp({ embedded = false }: { embedded?: boolean }) {
  const records = useHistoryStore((s) => s.records);

  if (embedded) {
    return (
      <>
        <div className="side-panel__section-header">
          <span className="heading-caps">Download History</span>
          <span className="side-panel__badge label-xs">{records.length} records</span>
        </div>
        <HistoryContent records={records} />
      </>
    );
  }

  return (
    <div className="history">
      <header className="history__header">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M13 3a9 9 0 00-9 9H1l3.9 3.9.1.1L9 12H6c0-3.9 3.1-7 7-7s7 3.1 7 7-3.1 7-7 7a6.9 6.9 0 01-5-2.1l-1.4 1.4A8.9 8.9 0 0013 21a9 9 0 000-18zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8z" />
        </svg>
        <h1 className="history__title">Download History</h1>
        <span className="history__count label-xs">{records.length} records</span>
      </header>
      <main className="history__body">
        <HistoryContent records={records} />
      </main>
    </div>
  );
}
