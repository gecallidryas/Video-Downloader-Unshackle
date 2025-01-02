import type { DetectedMedia } from '@/src/types/media';
import './MediaCard.css';

interface MediaCardProps {
  media: DetectedMedia;
  onPreview: () => void;
  onRemove: () => void;
  onDownload: () => void;
  onQualityChange: (quality: string) => void;
}

export function MediaCard({
  media,
  onPreview,
  onRemove,
  onDownload,
  onQualityChange,
}: MediaCardProps) {
  const isAudio = media.mediaType === 'audio';
  const singleQuality = media.qualities.length <= 1;

  return (
    <div className="media-card">
      {/* ── Top row: thumbnail + info ── */}
      <div className="media-card__row">
        <div className="media-card__thumb">
          {isAudio ? (
            <span className="media-card__audio-icon" data-testid="audio-icon">
              ♫
            </span>
          ) : (
            <span className="media-card__video-icon">▶</span>
          )}
          <span className="media-card__duration">{media.duration}</span>
        </div>

        <div className="media-card__info">
          <span className="media-card__title truncate" title={media.title}>
            {media.title}
          </span>
          <div className="media-card__meta">
            <span className="media-card__chip">{media.format}</span>
            <span className="media-card__size label-xs">{media.size}</span>
          </div>
        </div>
      </div>

      {/* ── Bottom row: quality selector + actions ── */}
      <div className="media-card__actions">
        <select
          className="media-card__quality"
          value={media.selectedQuality}
          disabled={singleQuality}
          onChange={(e) => onQualityChange(e.target.value)}
          aria-label="Quality"
        >
          {media.qualities.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}
            </option>
          ))}
        </select>

        <div className="media-card__buttons">
          <button
            className="media-card__icon-btn"
            onClick={onPreview}
            aria-label="Preview"
            title="Preview"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
              <path d="M10 4.5C5.8 4.5 2.3 7.3 1 10c1.3 2.7 4.8 5.5 9 5.5s7.7-2.8 9-5.5c-1.3-2.7-4.8-5.5-9-5.5zm0 9a3.5 3.5 0 110-7 3.5 3.5 0 010 7zm0-5.5a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
          </button>
          <button
            className="media-card__icon-btn media-card__icon-btn--danger"
            onClick={onRemove}
            aria-label="Remove"
            title="Remove"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
              <path d="M14.3 5.7a1 1 0 00-1.4 0L10 8.6 7.1 5.7a1 1 0 00-1.4 1.4L8.6 10l-2.9 2.9a1 1 0 101.4 1.4L10 11.4l2.9 2.9a1 1 0 001.4-1.4L11.4 10l2.9-2.9a1 1 0 000-1.4z" />
            </svg>
          </button>
          <button
            className="media-card__download-btn"
            onClick={onDownload}
            aria-label="Download"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
