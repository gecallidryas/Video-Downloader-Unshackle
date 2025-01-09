import type { TrackOption } from '@/src/types/media';

interface TrackPickerProps {
  kind: 'audio' | 'subtitle';
  tracks: TrackOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

function trackLabel(track: TrackOption): string {
  if (track.language) {
    return `[${track.language}] ${track.label}`;
  }

  return track.label;
}

export function TrackPicker({
  kind,
  tracks,
  selectedIds,
  onChange,
}: TrackPickerProps) {
  if (kind === 'audio' && tracks.length <= 1) {
    return null;
  }

  if (kind === 'subtitle' && tracks.length === 0) {
    return null;
  }

  const selectedValue = selectedIds[0] ?? '';
  const label = kind === 'audio' ? 'Audio' : 'Subtitles';

  return (
    <label className="media-card__track">
      <span className="media-card__control-label">{label}</span>
      <select
        className="media-card__track-select"
        value={selectedValue}
        aria-label={label}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value ? [value] : []);
        }}
      >
        {kind === 'subtitle' ? <option value="">None</option> : null}
        {tracks.map((track) => (
          <option key={track.id} value={track.id}>
            {trackLabel(track)}
          </option>
        ))}
      </select>
    </label>
  );
}
