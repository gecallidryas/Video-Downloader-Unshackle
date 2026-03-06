import { useMemo, useState } from 'react';
import {
  QueueItem,
  type QueueAction,
  type QueueViewItem,
  type QueueViewStatus,
} from './QueueItem';
import type { SegmentRange } from '@/src/ui/shared/SegmentGrid';
import './QueueView.css';

type DownloadsTab = 'active' | 'failed' | 'completed';

export interface HistoryRow {
  id: string;
  displayName: string;
  protocol: string;
  status: string;
  mediaKind?: string;
  fileName?: string;
  outputMimeType?: string;
  outputNotes?: string[];
  fileSizeBytes?: number;
  pageTitle?: string;
  createdAt: number;
}

interface QueueViewProps {
  items: QueueViewItem[];
  historyRecords?: HistoryRow[];
  onAction: (action: QueueAction, id: string) => void;
  onSegmentRetry?: (id: string, segmentIndex: number) => void;
  onSegmentRangeChange?: (id: string, range: SegmentRange) => void;
  onCopyCommand?: (profileId: string, id: string) => void;
}

const tabStatus: Record<'active' | 'failed', QueueViewStatus[]> = {
  active: ['running', 'paused', 'pending'],
  failed: ['failed'],
};

function tabCount(items: QueueViewItem[], tab: 'active' | 'failed'): number {
  const statuses = new Set(tabStatus[tab]);
  return items.filter((item) => statuses.has(item.status)).length;
}

function completedCount(items: QueueViewItem[], historyRecords: HistoryRow[]): number {
  return items.filter((item) => item.status === 'completed').length + historyRecords.length;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${(bytes / 1_000).toFixed(0)} KB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function QueueView({
  items,
  historyRecords = [],
  onAction,
  onSegmentRetry,
  onSegmentRangeChange,
  onCopyCommand,
}: QueueViewProps) {
  const [activeTab, setActiveTab] = useState<DownloadsTab>('active');
  const counts = useMemo(
    () => ({
      active: tabCount(items, 'active'),
      failed: tabCount(items, 'failed'),
      completed: completedCount(items, historyRecords),
    }),
    [items, historyRecords],
  );
  const visibleItems = activeTab === 'completed'
    ? items.filter((item) => item.status === 'completed')
    : items.filter((item) => tabStatus[activeTab].includes(item.status));

  return (
    <section className="queue-view" aria-label="Downloads">
      <div className="queue-view__tabs" role="tablist" aria-label="Download status">
        {(['active', 'failed', 'completed'] as DownloadsTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`queue-view__tab ${activeTab === tab ? 'queue-view__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab[0].toUpperCase() + tab.slice(1)} {counts[tab]}
          </button>
        ))}
      </div>

      <div className="queue-view__list">
        {activeTab === 'completed' ? (
          visibleItems.length > 0 || historyRecords.length > 0 ? (
            <>
              {visibleItems.map((item) => (
                <QueueItem
                  key={item.id}
                  item={item}
                  onAction={onAction}
                  onSegmentRetry={onSegmentRetry}
                  onSegmentRangeChange={onSegmentRangeChange}
                  onCopyCommand={onCopyCommand}
                />
              ))}
              {historyRecords.map((record) => (
              <div key={record.id} className="queue-item">
                <div className="queue-item__main">
                  <div className="queue-item__title">{record.displayName}</div>
                  <div className="queue-item__status">
                    <span className="queue-item__chip">{record.protocol.toUpperCase()}</span>
                    {record.fileSizeBytes ? ` ${formatBytes(record.fileSizeBytes)}` : ''}
                  </div>
                  <div className="queue-item__output">
                    {record.fileName ? `${record.fileName} ` : ''}
                    {record.outputMimeType ? (
                      <span className="queue-item__output-mime">
                        {record.outputMimeType}
                      </span>
                    ) : null}
                    {record.pageTitle ? ` ${record.pageTitle} · ` : ' '}
                    {formatDate(record.createdAt)}
                  </div>
                  {record.outputNotes?.length ? (
                    <div className="queue-item__notes">
                      {record.outputNotes.map((note) => (
                        <div key={note} className="queue-item__note">
                          {note}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              ))}
            </>
          ) : (
            <div className="queue-view__empty">No completed downloads yet.</div>
          )
        ) : visibleItems.length > 0 ? (
          visibleItems.map((item) => (
            <QueueItem
              key={item.id}
              item={item}
              onAction={onAction}
              onSegmentRetry={onSegmentRetry}
              onSegmentRangeChange={onSegmentRangeChange}
              onCopyCommand={onCopyCommand}
            />
          ))
        ) : (
          <div className="queue-view__empty">
            {activeTab === 'active' ? 'No active downloads.' : 'No failed downloads.'}
          </div>
        )}
      </div>
    </section>
  );
}

export type { QueueAction, QueueViewItem };
