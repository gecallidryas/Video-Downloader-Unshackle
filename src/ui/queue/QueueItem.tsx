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

export type QueueAction = 'cancel' | 'retry' | 'open' | 'pause' | 'resume';

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
  const overflowActions: MenuAction[] = onCopyCommand
    ? (commandProfileIds ?? DEFAULT_PROFILE_IDS).map((profileId) => ({
        id: `copy-command:${profileId}`,
        label: `Copy ${profileId} command`,
      }))
    : [];

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
        {overflowActions.length > 0 && onCopyCommand ? (
          <OverflowMenu
            aria-label={`More actions for ${item.title}`}
            actions={overflowActions}
            onAction={(actionId) => {
              const [kind, profileId] = actionId.split(':');
              if (kind === 'copy-command' && profileId) {
                onCopyCommand(profileId, item.id);
              }
            }}
          />
        ) : null}
      </div>
    </article>
  );
}
