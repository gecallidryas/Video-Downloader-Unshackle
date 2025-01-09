import { useEffect, useState } from 'react';
import type { MediaTrimSelection } from '@/src/types/media';

interface TrimControlsProps {
  enabled: boolean;
  value: MediaTrimSelection | null;
  onChange: (value: MediaTrimSelection | null) => void;
}

function parseTimeToSeconds(value: string): number | undefined {
  const raw = value.trim();
  if (!raw) {
    return undefined;
  }

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }

  const parts = raw.split(':').map((part) => Number(part.trim()));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = parts;
  return hours * 3600 + minutes * 60 + seconds;
}

function formatSeconds(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds)) {
    return '';
  }

  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function TrimControls({
  enabled,
  value,
  onChange,
}: TrimControlsProps) {
  const [start, setStart] = useState(formatSeconds(value?.startSec));
  const [end, setEnd] = useState(formatSeconds(value?.endSec));

  useEffect(() => {
    setStart(formatSeconds(value?.startSec));
    setEnd(formatSeconds(value?.endSec));
  }, [value?.startSec, value?.endSec]);

  if (!enabled) {
    return null;
  }

  const commit = (nextStart = start, nextEnd = end) => {
    const startSec = parseTimeToSeconds(nextStart);
    const endSec = parseTimeToSeconds(nextEnd);
    const nextValue: MediaTrimSelection = {};

    if (startSec != null) {
      nextValue.startSec = startSec;
    }

    if (endSec != null) {
      nextValue.endSec = endSec;
    }

    onChange(Object.keys(nextValue).length > 0 ? nextValue : null);
  };

  return (
    <div className="media-card__trim" aria-label="Trim controls">
      <label className="media-card__trim-field">
        <span className="media-card__control-label">Trim start</span>
        <input
          className="media-card__trim-input"
          aria-label="Trim start"
          value={start}
          placeholder="0:00"
          onChange={(event) => setStart(event.target.value)}
          onBlur={() => commit()}
        />
      </label>
      <label className="media-card__trim-field">
        <span className="media-card__control-label">Trim end</span>
        <input
          className="media-card__trim-input"
          aria-label="Trim end"
          value={end}
          placeholder="--:--"
          onChange={(event) => setEnd(event.target.value)}
          onBlur={() => commit()}
        />
      </label>
    </div>
  );
}
