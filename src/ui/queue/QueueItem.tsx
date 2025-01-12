export type QueueViewStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';

export interface QueueViewItem {
  id: string;
  title: string;
  status: QueueViewStatus;
  progressPct: number;
  statusText?: string;
  error?: string;
  outputLabel?: string;
}

export type QueueAction = 'cancel' | 'retry' | 'open' | 'pause' | 'resume';

interface QueueItemProps {
  item: QueueViewItem;
  onAction: (action: QueueAction, id: string) => void;
}

function statusLabel(item: QueueViewItem): string {
  if (item.error) {
    return item.error;
  }

  if (item.statusText) {
    return item.statusText;
  }

  return item.status;
}

export function QueueItem({ item, onAction }: QueueItemProps) {
  const progress = Math.max(0, Math.min(100, Math.round(item.progressPct || 0)));

  return (
    <article className="queue-item">
      <div className="queue-item__main">
        <div className="queue-item__title">{item.title}</div>
        <div className={`queue-item__status queue-item__status--${item.status}`}>
          {statusLabel(item)}
        </div>
        {item.outputLabel ? (
          <div className="queue-item__output">{item.outputLabel}</div>
        ) : null}
        {item.status === 'running' ? (
          <div
            className="queue-item__progress"
            role="progressbar"
            aria-label={`${item.title} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span
              className="queue-item__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
      </div>
      <div className="queue-item__actions">
        {item.status === 'running' || item.status === 'pending' ? (
          <button
            type="button"
            className="queue-item__button"
            aria-label={`Cancel ${item.title}`}
            onClick={() => onAction('cancel', item.id)}
          >
            Cancel
          </button>
        ) : null}
        {item.status === 'failed' ? (
          <button
            type="button"
            className="queue-item__button"
            aria-label={`Retry ${item.title}`}
            onClick={() => onAction('retry', item.id)}
          >
            Retry
          </button>
        ) : null}
        {item.status === 'completed' ? (
          <button
            type="button"
            className="queue-item__button"
            aria-label={`Open ${item.title}`}
            onClick={() => onAction('open', item.id)}
          >
            Open
          </button>
        ) : null}
      </div>
    </article>
  );
}
