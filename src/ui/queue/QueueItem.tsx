import { useMemo } from 'react';
import { OverflowMenu, type MenuAction } from '@/src/ui/shared/OverflowMenu';

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

export type QueueAction =
  | 'cancel'
  | 'retry'
  | 'open'
  | 'pause'
  | 'resume'
  | 'resave'
  | 'remove'
  | 'copy-url'
  | 'copy-filename'
  | 'copy-command';

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

  const menuActions = useMemo<MenuAction[]>(() => {
    const items: MenuAction[] = [
      { id: 'copy-url', label: 'Copy URL' },
      { id: 'copy-filename', label: 'Copy filename' },
    ];
    if (item.status === 'completed') {
      items.push({ id: 'resave', label: 'Save again' });
    }
    items.push({ id: 'copy-command', label: 'Copy command' });
    items.push({
      id: 'remove',
      label: 'Remove from queue',
      danger: true,
      divider: true,
    });
    return items;
  }, [item.status]);

  function handleMenu(actionId: string) {
    onAction(actionId as QueueAction, item.id);
  }

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
        <OverflowMenu
          actions={menuActions}
          onAction={handleMenu}
          aria-label="More actions"
        />
      </div>
    </article>
  );
}
