import { useCallback, useEffect, useRef, useState } from 'react';
import './SegmentGrid.css';

export type SegmentStatus = 'pending' | 'downloading' | 'done' | 'failed' | 'skipped';

export interface SegmentCell {
  index: number;
  status: SegmentStatus;
}

export interface SegmentRange {
  start: number;
  end: number;
}

export interface SegmentGridProps {
  segments: SegmentCell[];
  selectedRange?: SegmentRange;
  onSegmentClick?: (index: number) => void;
  onRangeChange?: (range: SegmentRange) => void;
  'aria-label'?: string;
}

function normalizeRange(a: number, b: number): SegmentRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

function isInRange(index: number, range: SegmentRange | undefined): boolean {
  return range !== undefined && index >= range.start && index <= range.end;
}

export function SegmentGrid({
  segments,
  selectedRange,
  onSegmentClick,
  onRangeChange,
  'aria-label': ariaLabel,
}: SegmentGridProps) {
  const dragAnchorRef = useRef<number | null>(null);
  const [hoverRange, setHoverRange] = useState<SegmentRange | undefined>();

  const handlePointerUp = useCallback(() => {
    dragAnchorRef.current = null;
    setHoverRange(undefined);
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerUp]);

  function handlePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.shiftKey && onRangeChange) {
      const anchor = selectedRange?.start ?? index;
      onRangeChange(normalizeRange(anchor, index));
      return;
    }

    dragAnchorRef.current = index;
    setHoverRange({ start: index, end: index });
  }

  function handlePointerEnter(index: number) {
    if (dragAnchorRef.current === null) {
      return;
    }
    setHoverRange(normalizeRange(dragAnchorRef.current, index));
  }

  function handleClick(index: number, event: React.MouseEvent) {
    if (event.shiftKey) {
      return;
    }

    if (hoverRange && hoverRange.start !== hoverRange.end && onRangeChange) {
      onRangeChange(hoverRange);
      return;
    }

    onSegmentClick?.(index);
  }

  const activeRange = hoverRange ?? selectedRange;

  return (
    <div
      className="segment-grid"
      role="grid"
      aria-label={ariaLabel ?? 'Segment status grid'}
    >
      {segments.map((segment) => {
        const selected = isInRange(segment.index, activeRange);
        return (
          <button
            key={segment.index}
            type="button"
            role="gridcell"
            className={`segment-grid__cell segment-grid__cell--${segment.status}${
              selected ? ' segment-grid__cell--selected' : ''
            }`}
            aria-label={`Segment ${segment.index} ${segment.status}`}
            title={`#${segment.index} • ${segment.status}`}
            onPointerDown={(event) => handlePointerDown(event, segment.index)}
            onPointerEnter={() => handlePointerEnter(segment.index)}
            onClick={(event) => handleClick(segment.index, event)}
          />
        );
      })}
    </div>
  );
}
