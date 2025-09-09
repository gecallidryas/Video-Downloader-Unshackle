import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './PreviewGrid.css';

export interface PreviewGridItem {
  id: string;
  url: string;
  filename: string;
  thumbnailUrl?: string | null;
  durationSec?: number;
  sizeBytes?: number;
  detectedAt?: number;
  probeFailed?: boolean;
}

export type PreviewGridSortKey = 'detectedAt' | 'duration' | 'size' | 'filename';

export interface PreviewGridProps {
  advancedMode: boolean;
  items: PreviewGridItem[];
  onDownloadSelected?: (ids: string[]) => void;
  onCopyUrls?: (urls: string[]) => void;
  onRemoveSelected?: (ids: string[]) => void;
  onRetryProbe?: (id: string) => void;
}

function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) {
    return '—';
  }
  if (sec < 60) {
    return `${Math.round(sec)}s`;
  }
  const minutes = Math.floor(sec / 60);
  const seconds = Math.round(sec % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatSize(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes)) {
    return '—';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function sortItems(
  items: PreviewGridItem[],
  key: PreviewGridSortKey,
): PreviewGridItem[] {
  const copy = [...items];
  copy.sort((a, b) => {
    switch (key) {
      case 'duration':
        return (a.durationSec ?? 0) - (b.durationSec ?? 0);
      case 'size':
        return (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0);
      case 'filename':
        return a.filename.localeCompare(b.filename);
      case 'detectedAt':
      default:
        return (a.detectedAt ?? 0) - (b.detectedAt ?? 0);
    }
  });
  return copy;
}

function countDuplicates(items: PreviewGridItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.filename, (counts.get(item.filename) ?? 0) + 1);
  }
  return counts;
}

interface PreviewGridCellProps {
  item: PreviewGridItem;
  duplicateCount: number;
  selected: boolean;
  onToggle: (id: string) => void;
  onRetryProbe?: (id: string) => void;
  observe: (element: Element | null, id: string) => void;
  visible: boolean;
}

function PreviewGridCell({
  item,
  duplicateCount,
  selected,
  onToggle,
  onRetryProbe,
  observe,
  visible,
}: PreviewGridCellProps) {
  const cellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    observe(cellRef.current, item.id);
    return () => observe(null, item.id);
  }, [item.id, observe]);

  return (
    <div
      ref={cellRef}
      role="gridcell"
      className={
        selected
          ? 'preview-grid__cell preview-grid__cell--selected'
          : 'preview-grid__cell'
      }
      data-id={item.id}
    >
      <label className="preview-grid__select">
        <input
          type="checkbox"
          aria-label={`Select ${item.filename}`}
          checked={selected}
          onChange={() => onToggle(item.id)}
        />
      </label>

      <div className="preview-grid__thumb">
        {item.probeFailed ? (
          <div className="preview-grid__broken" aria-label="Probe failed">
            <span aria-hidden="true">⌧</span>
            {onRetryProbe ? (
              <button
                type="button"
                className="preview-grid__retry"
                aria-label={`Retry probe for ${item.filename}`}
                onClick={() => onRetryProbe(item.id)}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : visible && item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt={item.filename} loading="lazy" />
        ) : (
          <div className="preview-grid__placeholder" aria-hidden="true" />
        )}
        {duplicateCount > 1 ? (
          <span className="preview-grid__dup-badge" title={`${duplicateCount} duplicates`}>
            ×{duplicateCount}
          </span>
        ) : null}
      </div>

      <div className="preview-grid__meta">
        <span className="preview-grid__filename" title={item.filename}>
          {item.filename}
        </span>
        <span className="preview-grid__sub">
          {formatDuration(item.durationSec)} · {formatSize(item.sizeBytes)}
        </span>
      </div>
    </div>
  );
}

export function PreviewGrid({
  advancedMode,
  items,
  onDownloadSelected,
  onCopyUrls,
  onRemoveSelected,
  onRetryProbe,
}: PreviewGridProps) {
  const [sortKey, setSortKey] = useState<PreviewGridSortKey>('detectedAt');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

  const observerRef = useRef<IntersectionObserver | null>(null);
  const targetIdsRef = useRef<Map<Element, string>>(new Map());
  const pendingRef = useRef<Map<string, Element>>(new Map());

  if (advancedMode && !observerRef.current && typeof IntersectionObserver !== 'undefined') {
    observerRef.current = new IntersectionObserver((entries) => {
      setVisibleIds((current) => {
        const next = new Set(current);
        for (const entry of entries) {
          const id = targetIdsRef.current.get(entry.target);
          if (!id) {
            continue;
          }
          if (entry.isIntersecting) {
            next.add(id);
          }
        }
        return next;
      });
    });
  }

  useEffect(() => {
    if (!advancedMode) {
      return undefined;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setVisibleIds(new Set(items.map((item) => item.id)));
      return undefined;
    }
    // Flush any pending cell registrations queued before the observer existed.
    const observer = observerRef.current;
    if (observer) {
      for (const [id, element] of pendingRef.current) {
        targetIdsRef.current.set(element, id);
        observer.observe(element);
      }
      pendingRef.current.clear();
    }
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      targetIdsRef.current.clear();
    };
  }, [advancedMode, items]);

  const observe = useCallback((element: Element | null, id: string) => {
    const observer = observerRef.current;
    if (element) {
      if (observer) {
        targetIdsRef.current.set(element, id);
        observer.observe(element);
      } else {
        pendingRef.current.set(id, element);
      }
    } else {
      if (observer) {
        for (const [el, mappedId] of targetIdsRef.current) {
          if (mappedId === id) {
            observer.unobserve(el);
            targetIdsRef.current.delete(el);
          }
        }
      }
      pendingRef.current.delete(id);
    }
  }, []);

  const sorted = useMemo(() => sortItems(items, sortKey), [items, sortKey]);
  const duplicates = useMemo(() => countDuplicates(items), [items]);
  const seenFilenames = useRef<Set<string>>(new Set());
  seenFilenames.current = new Set();

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (!advancedMode) {
    return null;
  }

  const selectedIds = sorted.filter((item) => selected.has(item.id)).map((item) => item.id);

  return (
    <section className="preview-grid" aria-label="Preview grid">
      <header className="preview-grid__toolbar">
        <label className="preview-grid__sort">
          <span>Sort by</span>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as PreviewGridSortKey)}
          >
            <option value="detectedAt">Detection time</option>
            <option value="duration">Duration</option>
            <option value="size">Size</option>
            <option value="filename">Filename</option>
          </select>
        </label>
        <div className="preview-grid__actions">
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => onDownloadSelected?.(selectedIds)}
          >
            Download selected
          </button>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() =>
              onCopyUrls?.(
                sorted
                  .filter((item) => selected.has(item.id))
                  .map((item) => item.url),
              )
            }
          >
            Copy URLs
          </button>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => onRemoveSelected?.(selectedIds)}
          >
            Remove selected
          </button>
        </div>
      </header>

      <div role="grid" className="preview-grid__grid">
        {sorted.map((item) => {
          const isFirstOccurrence = !seenFilenames.current.has(item.filename);
          seenFilenames.current.add(item.filename);
          const count = duplicates.get(item.filename) ?? 1;
          return (
            <PreviewGridCell
              key={item.id}
              item={item}
              duplicateCount={isFirstOccurrence ? count : 1}
              selected={selected.has(item.id)}
              onToggle={toggle}
              onRetryProbe={onRetryProbe}
              observe={observe}
              visible={visibleIds.has(item.id)}
            />
          );
        })}
      </div>
    </section>
  );
}
