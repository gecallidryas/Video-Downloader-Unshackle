import { useCallback, useRef, useState } from 'react';
import { formatTime } from './VideoPlayer';
import type { MediaTrimSelection } from '@/src/types/media';
import './TrimSlider.css';

interface TrimSliderProps {
  duration: number;
  value: MediaTrimSelection | null;
  onChange: (value: MediaTrimSelection | null) => void;
  enabled: boolean;
}

export function TrimSlider({ duration, value, onChange, enabled }: TrimSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  const startSec = value?.startSec ?? 0;
  const endSec = value?.endSec ?? duration;

  const pctOf = useCallback(
    (sec: number) => (duration > 0 ? (sec / duration) * 100 : 0),
    [duration],
  );

  const secFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * duration * 10) / 10;
    },
    [duration],
  );

  function emitChange(nextStart: number, nextEnd: number) {
    const s = Math.round(Math.max(0, Math.min(nextStart, duration)) * 10) / 10;
    const e = Math.round(Math.max(0, Math.min(nextEnd, duration)) * 10) / 10;
    const hasStart = s > 0;
    const hasEnd = e < duration;
    if (!hasStart && !hasEnd) {
      onChange(null);
      return;
    }
    const next: MediaTrimSelection = {};
    if (hasStart) next.startSec = s;
    if (hasEnd) next.endSec = e;
    onChange(next);
  }

  function handlePointerDown(handle: 'start' | 'end') {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(handle);
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const sec = secFromClientX(e.clientX);
    if (dragging === 'start') {
      emitChange(Math.min(sec, endSec - 0.1), endSec);
    } else {
      emitChange(startSec, Math.max(sec, startSec + 0.1));
    }
  }

  function handlePointerUp() {
    setDragging(null);
  }

  function handleReset() {
    onChange(null);
  }

  function handleKeyDown(handle: 'start' | 'end') {
    return (e: React.KeyboardEvent) => {
      let nextStart = startSec;
      let nextEnd = endSec;

      switch (e.key) {
        case 'ArrowLeft':
          if (handle === 'start') nextStart -= 1;
          else nextEnd -= 1;
          break;
        case 'ArrowRight':
          if (handle === 'start') nextStart += 1;
          else nextEnd += 1;
          break;
        case 'PageDown':
          if (handle === 'start') nextStart -= 10;
          else nextEnd -= 10;
          break;
        case 'PageUp':
          if (handle === 'start') nextStart += 10;
          else nextEnd += 10;
          break;
        case 'Home':
          if (handle === 'start') nextStart = 0;
          else nextEnd = startSec + 0.1;
          break;
        case 'End':
          if (handle === 'start') nextStart = endSec - 0.1;
          else nextEnd = duration;
          break;
        default:
          return;
      }

      e.preventDefault();
      if (handle === 'start') {
        emitChange(Math.min(nextStart, endSec - 0.1), endSec);
      } else {
        emitChange(startSec, Math.max(nextEnd, startSec + 0.1));
      }
    };
  }

  if (!enabled || duration <= 0) return null;

  const leftPct = pctOf(startSec);
  const rightPct = pctOf(endSec);

  return (
    <div className="trim-slider" aria-label="Trim range">
      <div className="trim-slider__header">
        <span className="trim-slider__label">
          Trim: {formatTime(startSec)} — {formatTime(endSec)}
        </span>
        {value && (
          <button
            type="button"
            className="trim-slider__reset"
            onClick={handleReset}
            aria-label="Reset trim"
          >
            Reset
          </button>
        )}
      </div>
      <div
        ref={trackRef}
        className="trim-slider__track"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="trim-slider__inactive trim-slider__inactive--left" style={{ width: `${leftPct}%` }} />
        <div className="trim-slider__inactive trim-slider__inactive--right" style={{ width: `${100 - rightPct}%` }} />
        <div
          className="trim-slider__region"
          style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
        />
        <div
          className={`trim-slider__handle trim-slider__handle--start ${dragging === 'start' ? 'trim-slider__handle--active' : ''}`}
          style={{ left: `${leftPct}%` }}
          role="slider"
          aria-label="Trim start"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={startSec}
          aria-valuetext={formatTime(startSec)}
          tabIndex={0}
          onPointerDown={handlePointerDown('start')}
          onKeyDown={handleKeyDown('start')}
        />
        <div
          className={`trim-slider__handle trim-slider__handle--end ${dragging === 'end' ? 'trim-slider__handle--active' : ''}`}
          style={{ left: `${rightPct}%` }}
          role="slider"
          aria-label="Trim end"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={endSec}
          aria-valuetext={formatTime(endSec)}
          tabIndex={0}
          onPointerDown={handlePointerDown('end')}
          onKeyDown={handleKeyDown('end')}
        />
      </div>
    </div>
  );
}
