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
  outputMimeType?: string;
  notes?: string[];
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
  onCopyCommand?: (profileId: string, id: string) => void;
  commandProfileIds?: string[];
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

const DEFAULT_PROFILE_IDS = ['yt-dlp', 'ffmpeg', 'streamlink', 'hlsdl', 'n_m3u8dl-re'];

export function QueueItem({
  item,
  onAction,
  onCopyCommand,
  commandProfileIds,
}: QueueItemProps) {
  const progress = Math.max(0, Math.min(100, Math.round(item.progressPct || 0)));

  const menuActions = useMemo<MenuAction[]>(() => {
    const items: MenuAction[] = [
      { id: 'copy-url', label: 'Copy URL' },
      { id: 'copy-filename', label: 'Copy filename' },
    ];
    if (item.status === 'completed') {
      items.push({ id: 'resave', label: 'Save again' });
    }
    if (onCopyCommand) {
      for (const profileId of commandProfileIds ?? DEFAULT_PROFILE_IDS) {
        items.push({ id: `copy-command:${profileId}`, label: `Copy ${profileId} command` });
      }
    } else {
      items.push({ id: 'copy-command', label: 'Copy command' });
    }
    items.push({
      id: 'remove',
      label: 'Remove from queue',
      danger: true,
      divider: true,
    });
    return items;
  }, [item.status, onCopyCommand, commandProfileIds]);

  function handleMenu(actionId: string) {
    if (actionId.startsWith('copy-command:') && onCopyCommand) {
      const [, profileId] = actionId.split(':');
      if (profileId) {
        onCopyCommand(profileId, item.id);
        return;
      }
    }
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
          <div className="queue-item__output">
            <span>{item.outputLabel}</span>
            {item.outputMimeType ? (
              <span className="queue-item__output-mime">{item.outputMimeType}</span>
            ) : null}
          </div>
        ) : null}
        {item.notes?.length ? (
          <div className="queue-item__notes">
            {item.notes.map((note) => (
              <div key={note} className="queue-item__note">
                {note}
              </div>
            ))}
          </div>
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
          aria-label={`More actions for ${item.title}`}
        />
      </div>
    </article>
  );
}
