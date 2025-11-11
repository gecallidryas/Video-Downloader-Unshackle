import { useEffect, useMemo, useState } from 'react';
import { TrimControls } from '@/src/ui/media/TrimControls';
import type { MediaTrimSelection } from '@/src/types/media';
import type { StreamProtocol } from '@/video_downloader_types_skeleton';
import {
  isCodecSupported,
  type CodecInfo,
} from '@/src/core/preview/codec-sniff';
import { CodecBadge } from './CodecBadge';
import { usePreviewPlayer } from './usePreviewPlayer';
import './PreviewModal.css';

export interface DownloadedRange {
  start: number;
  end: number;
}

export interface LiveSegmentSource {
  /** MIME type for SourceBuffer creation when MediaSource is available. */
  mimeType: string;
  /** Async iterator of completed segment bytes. Implementation lives in run-hls-job.ts wiring. */
  segments: AsyncIterable<Uint8Array>;
}

interface PreviewModalProps {
  open: boolean;
  title: string;
  sourceUrl: string;
  protocol: StreamProtocol;
  restrictedMessage?: string;
  nativeHelperAvailable?: boolean;
  codecInfo?: CodecInfo | null;
  downloadedRanges?: DownloadedRange[];
  totalDurationSec?: number;
  liveSegmentSource?: LiveSegmentSource;
  onClose: () => void;
  onDownload: (trim: MediaTrimSelection | null) => void;
  onDurationResolved?: (durationSec: number) => void;
}

function previewNote(
  protocol: StreamProtocol,
  restrictedMessage?: string,
  nativeHelperAvailable = false,
): string {
  if (restrictedMessage) {
    return restrictedMessage;
  }

  if (protocol === 'direct') {
    if (nativeHelperAvailable) {
      return 'Native helper is required for direct trim and will export the selected range.';
    }

    return 'Trim is not supported for direct file downloads yet; the full file will be downloaded.';
  }

  if (protocol === 'dash') {
    return 'DASH preview may not play in the side panel; trim applies during muxing.';
  }

  if (protocol === 'hls') {
    return 'HLS preview may require the offscreen preview host; trim applies during muxing.';
  }

  return '';
}

function buildRangeGradient(
  ranges: DownloadedRange[] | undefined,
  totalSec: number | undefined,
): string | undefined {
  if (!ranges || ranges.length === 0 || !totalSec || totalSec <= 0) {
    return undefined;
  }

  const stops: string[] = [];
  let cursor = 0;
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const startPct = Math.max(0, Math.min(100, (range.start / totalSec) * 100));
    const endPct = Math.max(0, Math.min(100, (range.end / totalSec) * 100));
    if (startPct > cursor) {
      stops.push(`var(--surface-variant) ${cursor}% ${startPct}%`);
    }
    stops.push(`var(--secondary) ${startPct}% ${endPct}%`);
    cursor = endPct;
  }
  if (cursor < 100) {
    stops.push(`var(--surface-variant) ${cursor}% 100%`);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

function ReloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 3V1L4 4l4 3V5a3 3 0 1 1-3 3H3a5 5 0 1 0 5-5z"
      />
    </svg>
  );
}

export function PreviewModal({
  open,
  title,
  sourceUrl,
  protocol,
  restrictedMessage,
  nativeHelperAvailable = false,
  codecInfo = null,
  downloadedRanges,
  totalDurationSec,
  liveSegmentSource: _liveSegmentSource,
  onClose,
  onDownload,
  onDurationResolved,
}: PreviewModalProps) {
  const [trim, setTrim] = useState<MediaTrimSelection | null>(null);
  const trimEnabled = protocol === 'hls' || protocol === 'dash' || (protocol === 'direct' && nativeHelperAvailable);
  const note = previewNote(protocol, restrictedMessage, nativeHelperAvailable);

  const playerProtocol: 'hls' | 'dash' | 'direct' =
    protocol === 'hls' || protocol === 'dash' || protocol === 'direct' ? protocol : 'direct';

  const { videoRef, reload, key } = usePreviewPlayer({
    sourceUrl,
    protocol: playerProtocol,
    onDurationResolved,
  });

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  const codecUnsupported = useMemo(() => {
    if (!codecInfo) {
      return false;
    }
    if (typeof document === 'undefined') {
      return false;
    }
    const probe = document.createElement('video');
    return !isCodecSupported(codecInfo, (mime) => probe.canPlayType(mime) as '' | 'maybe' | 'probably');
  }, [codecInfo]);

  const rangeGradient = buildRangeGradient(downloadedRanges, totalDurationSec);

  // Live MediaSource wiring: feature-detected. Real bytes-into-SourceBuffer integration
  // lands in run-hls-job.ts; UI honors progress via downloadedRanges.
  // Documented stub: when liveSegmentSource is provided, the orchestrator pushes appended
  // buffers and emits progress events that update downloadedRanges externally.

  if (!open) {
    return null;
  }

  return (
    <div className="preview-modal__overlay" onMouseDown={onClose}>
      <section
        className="preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${title}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="preview-modal__header">
          <h2 className="preview-modal__title">Preview {title}</h2>
          <div className="preview-modal__header-actions">
            {codecInfo ? (
              <CodecBadge info={codecInfo} unsupported={codecUnsupported} />
            ) : null}
            <button
              type="button"
              className="preview-modal__icon-button"
              aria-label="Reload preview"
              title="Reload preview"
              onClick={reload}
            >
              <ReloadIcon />
            </button>
            <button
              type="button"
              className="preview-modal__close"
              aria-label="Close preview"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </header>

        <video
          key={key}
          ref={videoRef}
          className="preview-modal__video"
          aria-label="Preview video"
          src={sourceUrl}
          controls
          preload="metadata"
        />

        {rangeGradient ? (
          <div
            className="preview-modal__progress"
            role="progressbar"
            aria-label="Downloaded preview region"
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ background: rangeGradient }}
          />
        ) : null}

        {note ? <p className="preview-modal__note">{note}</p> : null}

        <TrimControls
          enabled={trimEnabled}
          value={trim}
          onChange={setTrim}
        />

        <footer className="preview-modal__footer">
          <button
            type="button"
            className="preview-modal__download"
            onClick={() => onDownload(trim)}
          >
            Download Selection
          </button>
        </footer>
      </section>
    </div>
  );
}
