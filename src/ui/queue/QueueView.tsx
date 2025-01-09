import { useMemo, useState } from 'react';
import {
  QueueItem,
  type QueueAction,
  type QueueViewItem,
  type QueueViewStatus,
} from './QueueItem';
import './QueueView.css';

type QueueTab = 'pending' | 'active' | 'failed' | 'completed';

interface QueueViewProps {
  items: QueueViewItem[];
  onAction: (action: QueueAction, id: string) => void;
}

const tabStatus: Record<QueueTab, QueueViewStatus[]> = {
  pending: ['pending'],
  active: ['running', 'paused'],
  failed: ['failed'],
  completed: ['completed'],
};

function tabCount(items: QueueViewItem[], tab: QueueTab): number {
  const statuses = new Set(tabStatus[tab]);
  return items.filter((item) => statuses.has(item.status)).length;
}

export function QueueView({ items, onAction }: QueueViewProps) {
  const [activeTab, setActiveTab] = useState<QueueTab>('active');
  const counts = useMemo(
    () => ({
      pending: tabCount(items, 'pending'),
      active: tabCount(items, 'active'),
      failed: tabCount(items, 'failed'),
      completed: tabCount(items, 'completed'),
    }),
    [items],
  );
  const visibleItems = items.filter((item) =>
    tabStatus[activeTab].includes(item.status),
  );

  return (
    <section className="queue-view" aria-label="Download queue">
      <div className="queue-view__tabs" role="tablist" aria-label="Queue status">
        {(['pending', 'active', 'failed', 'completed'] as QueueTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`queue-view__tab ${activeTab === tab ? 'queue-view__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'active' ? 'Active' : tab[0].toUpperCase() + tab.slice(1)}{' '}
            {counts[tab]}
          </button>
        ))}
      </div>

      <div className="queue-view__list">
        {visibleItems.length > 0 ? (
          visibleItems.map((item) => (
            <QueueItem key={item.id} item={item} onAction={onAction} />
          ))
        ) : (
          <div className="queue-view__empty">No queue items in this state.</div>
        )}
      </div>
    </section>
  );
}

export type { QueueAction, QueueViewItem };
