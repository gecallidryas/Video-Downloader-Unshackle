# UI Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge Queue + History into a Downloads tab, add Advanced Mode toggle, gate Manual HLS behind a tool icon.

**Architecture:** Bottom nav shrinks from 4 to 3 tabs. QueueView gains a "Completed" sub-tab backed by HistoryApp data. Manual HLS form moves into a collapsible panel gated by `advancedMode`. Settings store exposes `advancedMode` + setter; PopupApp gets a toggle.

**Tech Stack:** React, Zustand, Vitest, CSS custom properties

---

### Task 1: Add advancedMode to useSettingsStore

**Files:**
- Modify: `src/state/useSettingsStore.ts:14-70`
- Modify: `src/state/__tests__/useSettingsStore.test.ts`

**Step 1: Add advancedMode + setter to SettingsState interface and store**

In `src/state/useSettingsStore.ts`, add to the `SettingsState` interface after the `captureRuleSizePredicate` field:

```typescript
  advancedMode: boolean;
  setAdvancedMode: (enabled: boolean) => void;
```

In the `create<SettingsState>` body, add after `resetCaptureRules`:

```typescript
  setAdvancedMode: (enabled) => set({ advancedMode: enabled }),
```

**Step 2: Write test**

In `src/state/__tests__/useSettingsStore.test.ts`, add:

```typescript
test('setAdvancedMode toggles the flag', () => {
  expect(useSettingsStore.getState().advancedMode).toBe(false);
  useSettingsStore.getState().setAdvancedMode(true);
  expect(useSettingsStore.getState().advancedMode).toBe(true);
});
```

**Step 3: Run tests**

Run: `npx vitest run src/state/__tests__/useSettingsStore.test.ts`
Expected: PASS

**Step 4: Commit**

```
feat(settings): expose advancedMode toggle in UI settings store
```

---

### Task 2: Add Advanced Mode toggle to PopupApp

**Files:**
- Modify: `src/app/surfaces/popup/PopupApp.tsx:23-186`
- Modify: `src/app/surfaces/popup/__tests__/PopupApp.test.tsx`

**Step 1: Add store selectors in SettingsContent**

In `src/app/surfaces/popup/PopupApp.tsx`, inside `SettingsContent()`, after the `enableContextMenu` / `toggleContextMenu` lines, add:

```typescript
  const advancedMode = useSettingsStore((s) => s.advancedMode);
  const setAdvancedMode = useSettingsStore((s) => s.setAdvancedMode);
```

**Step 2: Add toggle JSX**

After the context menu toggle `</label>` and before the capture rules `<section>`, add:

```tsx
      <label className="popup__row">
        <span className="popup__label">Advanced mode</span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Advanced mode"
          checked={advancedMode}
          onChange={() => setAdvancedMode(!advancedMode)}
          className="popup__toggle"
        />
      </label>
```

**Step 3: Write test**

In `src/app/surfaces/popup/__tests__/PopupApp.test.tsx`, add `advancedMode: false` to the `beforeEach` setState call. Then add test:

```typescript
test('advanced mode toggle updates the store', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);

  const toggle = screen.getByRole('checkbox', { name: /advanced mode/i });
  expect(toggle).not.toBeChecked();
  await user.click(toggle);
  expect(useSettingsStore.getState().advancedMode).toBe(true);
});
```

**Step 4: Run tests**

Run: `npx vitest run src/app/surfaces/popup/__tests__/PopupApp.test.tsx`
Expected: PASS

**Step 5: Commit**

```
feat(popup): add Advanced mode toggle to settings
```

---

### Task 3: Refactor BottomNav to 3 tabs

**Files:**
- Modify: `src/ui/layout/BottomNav.tsx` (full rewrite)
- Modify: `src/ui/queue/QueueView.css:9` (grid-template-columns)

**Step 1: Rewrite BottomNav**

Replace entire `src/ui/layout/BottomNav.tsx` with:

```tsx
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
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: errors in SidePanelApp.tsx (will fix in Task 5)

**Step 3: Commit**

```
refactor(nav): reduce BottomNav to 3 tabs (Downloads, Current, Settings)
```

---

### Task 4: Refactor QueueView sub-tabs (merge pending into active, add completed)

**Files:**
- Modify: `src/ui/queue/QueueView.tsx` (full rewrite)
- Modify: `src/ui/queue/QueueView.css:9`
- Modify: `src/ui/queue/__tests__/QueueView.test.tsx`

**Step 1: Rewrite QueueView to accept history records and use 3 sub-tabs**

Replace `src/ui/queue/QueueView.tsx`:

```tsx
import { useMemo, useState } from 'react';
import {
  QueueItem,
  type QueueAction,
  type QueueViewItem,
  type QueueViewStatus,
} from './QueueItem';
import './QueueView.css';

type DownloadsTab = 'active' | 'failed' | 'completed';

export interface HistoryRow {
  id: string;
  displayName: string;
  protocol: string;
  status: string;
  mediaKind?: string;
  fileSizeBytes?: number;
  pageTitle?: string;
  createdAt: number;
}

interface QueueViewProps {
  items: QueueViewItem[];
  historyRecords?: HistoryRow[];
  onAction: (action: QueueAction, id: string) => void;
}

const tabStatus: Record<'active' | 'failed', QueueViewStatus[]> = {
  active: ['running', 'paused', 'pending'],
  failed: ['failed'],
};

function tabCount(items: QueueViewItem[], tab: 'active' | 'failed'): number {
  const statuses = new Set(tabStatus[tab]);
  return items.filter((item) => statuses.has(item.status)).length;
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

export function QueueView({ items, historyRecords = [], onAction }: QueueViewProps) {
  const [activeTab, setActiveTab] = useState<DownloadsTab>('active');
  const counts = useMemo(
    () => ({
      active: tabCount(items, 'active'),
      failed: tabCount(items, 'failed'),
      completed: historyRecords.length,
    }),
    [items, historyRecords],
  );
  const visibleItems = activeTab !== 'completed'
    ? items.filter((item) => tabStatus[activeTab].includes(item.status))
    : [];

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
          historyRecords.length > 0 ? (
            historyRecords.map((record) => (
              <div key={record.id} className="queue-item">
                <div className="queue-item__main">
                  <div className="queue-item__title">{record.displayName}</div>
                  <div className="queue-item__status">
                    <span className="queue-item__chip">{record.protocol.toUpperCase()}</span>
                    {record.fileSizeBytes ? ` ${formatBytes(record.fileSizeBytes)}` : ''}
                  </div>
                  <div className="queue-item__output">
                    {record.pageTitle ? `${record.pageTitle} · ` : ''}{formatDate(record.createdAt)}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="queue-view__empty">No completed downloads yet.</div>
          )
        ) : visibleItems.length > 0 ? (
          visibleItems.map((item) => (
            <QueueItem key={item.id} item={item} onAction={onAction} />
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
```

**Step 2: Update QueueView.css grid to 3 columns**

In `src/ui/queue/QueueView.css` line 9, change:

```css
grid-template-columns: repeat(3, minmax(0, 1fr));
```

Add chip style at end of file:

```css
.queue-item__chip {
  display: inline-block;
  background: var(--surface-variant);
  color: var(--on-surface-variant);
  font-size: var(--text-label-size);
  padding: 1px 4px;
  border-radius: 2px;
}
```

**Step 3: Rewrite QueueView test**

Replace `src/ui/queue/__tests__/QueueView.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { QueueView, type QueueViewItem, type HistoryRow } from '../QueueView';

const items: QueueViewItem[] = [
  {
    id: 'job-running',
    title: 'Active stream',
    status: 'running',
    progressPct: 48,
    statusText: 'Fetching segments',
  },
  {
    id: 'job-pending',
    title: 'Queued clip',
    status: 'pending',
    progressPct: 0,
  },
  {
    id: 'job-failed',
    title: 'Failed clip',
    status: 'failed',
    progressPct: 12,
    error: 'Network error',
  },
];

const history: HistoryRow[] = [
  {
    id: 'hist-1',
    displayName: 'Finished video',
    protocol: 'hls',
    status: 'completed',
    fileSizeBytes: 52_000_000,
    pageTitle: 'Example Page',
    createdAt: Date.now(),
  },
];

test('renders 3 download status tabs with correct counts', () => {
  render(<QueueView items={items} historyRecords={history} onAction={() => {}} />);

  expect(screen.getByRole('tab', { name: /active 2/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /failed 1/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /completed 1/i })).toBeInTheDocument();
});

test('active tab shows running and pending items with progress', () => {
  render(<QueueView items={items} historyRecords={history} onAction={() => {}} />);

  const activeItem = screen.getByText('Active stream').closest('.queue-item');
  expect(activeItem).not.toBeNull();
  expect(within(activeItem as HTMLElement).getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '48',
  );
  expect(screen.getByText('Queued clip')).toBeInTheDocument();
});

test('completed tab shows history records', async () => {
  const user = userEvent.setup();
  render(<QueueView items={items} historyRecords={history} onAction={() => {}} />);

  await user.click(screen.getByRole('tab', { name: /completed/i }));
  expect(screen.getByText('Finished video')).toBeInTheDocument();
  expect(screen.getByText('HLS')).toBeInTheDocument();
  expect(screen.getByText(/52 MB/)).toBeInTheDocument();
});

test('failed tab shows retry action', async () => {
  const user = userEvent.setup();
  const onAction = vi.fn();
  render(<QueueView items={items} historyRecords={history} onAction={onAction} />);

  await user.click(screen.getByRole('tab', { name: /failed/i }));
  await user.click(screen.getByRole('button', { name: /retry failed clip/i }));
  expect(onAction).toHaveBeenCalledWith('retry', 'job-failed');
});
```

**Step 4: Run tests**

Run: `npx vitest run src/ui/queue/__tests__/QueueView.test.tsx`
Expected: PASS

**Step 5: Commit**

```
refactor(queue): merge pending into active, add completed tab with history data
```

---

### Task 5: Rewire SidePanelApp (PanelTab, DownloadsView, tool icon)

**Files:**
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.tsx`
- Modify: `src/app/surfaces/sidepanel/SidePanelApp.css`

**Step 1: Update PanelTab type and persistence**

In `SidePanelApp.tsx`, change line 40:

```typescript
type PanelTab = 'downloads' | 'current' | 'settings';
```

Update `readPersistedTab` (line 46-56) to accept new values and migrate old ones:

```typescript
function readPersistedTab(): PanelTab | null {
  try {
    const raw = globalThis.localStorage?.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (raw === 'downloads' || raw === 'current' || raw === 'settings') {
      return raw;
    }
    if (raw === 'history' || raw === 'queue') {
      return 'downloads';
    }
  } catch {
    // ignore storage errors
  }
  return null;
}
```

**Step 2: Add advancedMode import and tool icon state to DetectionView**

Add import at top:

```typescript
import { useSettingsStore } from '@/src/state/useSettingsStore';
```

Inside `DetectionView` function, add:

```typescript
  const advancedMode = useSettingsStore((s) => s.advancedMode);
  const [toolPanelOpen, setToolPanelOpen] = useState(false);
```

**Step 3: Replace Manual HLS form with gated collapsible panel**

Replace lines 300-346 (section header + manual HLS form) with:

```tsx
      <div className="side-panel__section-header">
        <span className="heading-caps">Detected Media</span>
        <span className="side-panel__badge label-xs">{fileLabel}</span>
        {advancedMode && (
          <button
            type="button"
            className={`side-panel__tool-btn ${toolPanelOpen ? 'side-panel__tool-btn--active' : ''}`}
            aria-label="Manual ingest tools"
            onClick={() => setToolPanelOpen((prev) => !prev)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
            </svg>
          </button>
        )}
      </div>
      {toolPanelOpen && advancedMode && (
        <form
          className="manual-hls"
          onSubmit={(event) => {
            event.preventDefault();
            void ingestManualHls();
          }}
        >
          <label className="manual-hls__field">
            <span className="label-xs">Manual HLS input</span>
            <textarea
              aria-label="Manual HLS input"
              value={manualHlsInput}
              onChange={(event) => setManualHlsInput(event.target.value)}
              className="manual-hls__textarea"
              rows={3}
            />
          </label>
          <label className="manual-hls__field">
            <span className="label-xs">Base URL</span>
            <input
              aria-label="Base URL"
              value={manualHlsBaseUrl}
              onChange={(event) => setManualHlsBaseUrl(event.target.value)}
              className="manual-hls__input"
            />
          </label>
          <div className="manual-hls__actions">
            <input
              aria-label="Manual HLS file"
              type="file"
              accept=".m3u8,.m3u,.txt,text/plain,application/vnd.apple.mpegurl"
              onChange={(event) => void loadManualHlsFile(event.currentTarget.files?.[0])}
              className="manual-hls__file"
            />
            <button
              type="submit"
              className="manual-hls__button"
              disabled={!manualHlsInput.trim()}
            >
              Ingest HLS
            </button>
          </div>
        </form>
      )}
```

**Step 4: Replace QueuePanel with DownloadsPanel**

Replace the `QueuePanel` function (lines 500-569) with:

```tsx
function DownloadsPanel() {
  const mediaItems = usePanelStore((s) => s.mediaItems);
  const queueJobs = usePanelStore((s) => s.queueJobs);
  const downloadingIds = usePanelStore((s) => s.downloadingIds);
  const historyRecords = useHistoryStore((s) => s.records);
  const [storage, setStorage] = useState<{ usage: number; quota: number }>({
    usage: 0,
    quota: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const estimate = globalThis.navigator?.storage?.estimate;
    if (typeof estimate !== 'function') {
      return;
    }
    void estimate.call(globalThis.navigator.storage).then((result) => {
      if (cancelled) return;
      setStorage({
        usage: typeof result.usage === 'number' ? result.usage : 0,
        quota: typeof result.quota === 'number' ? result.quota : 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const queueItems = useMemo<QueueViewItem[]>(
    () => {
      const mediaById = new Map(mediaItems.map((item) => [item.id, item]));
      const startedJobIds = new Set(queueJobs.map((job) => job.candidateId));
      const runtimeQueueItems: QueueViewItem[] = queueJobs.map((job) => {
        const item = mediaById.get(job.candidateId);

        return {
          id: job.id,
          title: item?.title ?? job.candidateId,
          status: queueStatusFromPhase(job.phase),
          progressPct: job.progressPct,
          statusText: queueStatusText(job),
          outputLabel: item?.format ?? job.output?.fileName,
        };
      });
      const localQueueItems: QueueViewItem[] = mediaItems
        .filter((item) => downloadingIds.has(item.id) && !startedJobIds.has(item.id))
        .map((item) => ({
          id: item.id,
          title: item.title,
          status: 'running' as const,
          progressPct: 1,
          statusText: 'Queued',
          outputLabel: item.format,
        }));

      return [...runtimeQueueItems, ...localQueueItems];
    },
    [downloadingIds, mediaItems, queueJobs],
  );

  const historyRows = useMemo(
    () => historyRecords.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      protocol: r.protocol,
      status: r.status,
      mediaKind: r.mediaKind,
      fileSizeBytes: r.fileSizeBytes,
      pageTitle: r.pageTitle,
      createdAt: r.createdAt,
    })),
    [historyRecords],
  );

  return (
    <>
      <QueueView items={queueItems} historyRecords={historyRows} onAction={() => {}} />
      <StorageFooter
        usageBytes={storage.usage}
        quotaBytes={storage.quota}
        level={computeStorageLevel(storage.usage, storage.quota)}
      />
    </>
  );
}
```

Add import for `useHistoryStore` at top:

```typescript
import { useHistoryStore } from '@/src/state/useHistoryStore';
```

Also add import for `HistoryRow` type:

```typescript
import { QueueView, type QueueViewItem, type HistoryRow } from '@/src/ui/queue/QueueView';
```

**Step 5: Update view routing and BottomNav wiring**

Replace lines 617-634 (view routing + BottomNav):

```tsx
        {activeTab === 'current' && (
          <DetectionView
            activeTabId={resolvedActiveTabId}
            runtimeClient={resolvedRuntimeClient}
          />
        )}
        {activeTab === 'downloads' && <DownloadsPanel />}
        {activeTab === 'settings' && <PopupApp embedded />}
      </main>

      <BottomNav
        activeTab={activeTab}
        onDownloadsClick={() => setActiveTab('downloads')}
        onCurrentClick={() => setActiveTab('current')}
        onSettingsClick={() => setActiveTab('settings')}
      />
```

Remove the `HistoryApp` import since it's no longer used here.

**Step 6: Add tool button CSS**

Append to `src/app/surfaces/sidepanel/SidePanelApp.css`:

```css
.side-panel__tool-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--outline);
  border-radius: var(--radius);
  background: transparent;
  color: var(--on-surface-variant);
  cursor: pointer;
  margin-left: auto;
}

.side-panel__tool-btn:hover {
  background: var(--surface-container);
  color: var(--on-surface);
}

.side-panel__tool-btn--active {
  background: var(--primary);
  color: var(--primary-action-text);
  border-color: var(--primary);
}
```

**Step 7: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 8: Commit**

```
feat(sidepanel): merge Queue+History into Downloads tab, gate manual HLS behind tool icon
```

---

### Task 6: Update SidePanelApp tests

**Files:**
- Modify: `src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx`
- Modify: `src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx`

**Step 1: Update SidePanelApp.test.tsx**

Replace the nav-related tests:

```typescript
test('renders bottom nav with downloads, current, and settings icons', () => {
  render(<SidePanelApp />);
  expect(screen.getByRole('button', { name: /downloads/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /current/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
});

test('opens the downloads tab from the bottom nav', async () => {
  const user = userEvent.setup();

  render(<SidePanelApp />);
  await user.click(screen.getByRole('button', { name: /downloads/i }));

  expect(
    screen.getByRole('tablist', { name: /download status/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /active 0/i })).toBeInTheDocument();
});

test('persists active tab to localStorage', async () => {
  const user = userEvent.setup();
  globalThis.localStorage.removeItem('unshackle:sidepanel:activeTab');

  render(<SidePanelApp />);
  await user.click(screen.getByRole('button', { name: /downloads/i }));

  expect(globalThis.localStorage.getItem('unshackle:sidepanel:activeTab')).toBe(
    'downloads',
  );
});

test('reads persisted active tab on mount', () => {
  globalThis.localStorage.setItem('unshackle:sidepanel:activeTab', 'downloads');

  render(<SidePanelApp />);

  expect(screen.getByRole('tablist', { name: /download status/i })).toBeInTheDocument();
  globalThis.localStorage.removeItem('unshackle:sidepanel:activeTab');
});

test('migrates old history/queue tab values to downloads', () => {
  globalThis.localStorage.setItem('unshackle:sidepanel:activeTab', 'history');

  render(<SidePanelApp />);

  expect(screen.getByRole('tablist', { name: /download status/i })).toBeInTheDocument();
  globalThis.localStorage.removeItem('unshackle:sidepanel:activeTab');
});
```

Remove old tests: `renders bottom nav with history, current, and settings icons`, `opens the queue tab from the flat bottom nav`, old persists/reads tests.

**Step 2: Update runtime-candidates.test.tsx for manual HLS**

The manual HLS ingest test needs to enable advancedMode and open the tool panel first. Add before the typing steps:

```typescript
import { useSettingsStore } from '@/src/state/useSettingsStore';

// Inside the test, before typing:
useSettingsStore.setState({ advancedMode: true });
// re-render or set before render
```

Then after render, click the tool button:

```typescript
await user.click(screen.getByRole('button', { name: /manual ingest tools/i }));
```

Then proceed with the existing type + submit assertions.

**Step 3: Run tests**

Run: `npx vitest run src/app/surfaces/sidepanel/__tests__/SidePanelApp.test.tsx src/app/surfaces/sidepanel/__tests__/runtime-candidates.test.tsx`
Expected: PASS

**Step 4: Commit**

```
test(sidepanel): update tests for Downloads tab and gated manual HLS
```

---

### Task 7: Full test suite + build verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: all tests PASS

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit any remaining fixes**

```
chore: fix any remaining test/build issues from UI restructure
```
