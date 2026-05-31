import { useEffect, useMemo, useState } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { TrimSlider } from './TrimSlider';
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
  mimeType: string;
  segments: AsyncIterable<Uint8Array>;
}

interface PreviewModalProps {
  open: boolean;
  title: string;
  sourceUrl: string;
  protocol: StreamProtocol;
  restrictedMessage?: string;
  nativeHelperAvailable?: boolean;
  browserRecordingAvailable?: boolean;
  codecInfo?: CodecInfo | null;
  downloadedRanges?: DownloadedRange[];
  totalDurationSec?: number;
  liveSegmentSource?: LiveSegmentSource;
  onClose: () => void;
  onDownload: (
    trim: MediaTrimSelection | null,
    options?: { outputKind: 'webm' },
  ) => void;
  onDurationResolved?: (durationSec: number) => void;
}

function previewNote(
  protocol: StreamProtocol,
  restrictedMessage?: string,
  nativeHelperAvailable = false,
  directOutputMode: 'original' | 'webm' = 'original',
): string {
  if (restrictedMessage) return restrictedMessage;
  if (protocol === 'direct') {
    if (directOutputMode === 'webm') {
      return 'Browser WebM clip will be recorded without the native helper.';
    }
    if (nativeHelperAvailable) {
      return 'Native helper is required for direct trim and will export the selected range.';
    }
    return 'Native required for original trim; full direct download is available without trimming.';
  }
  if (protocol === 'dash') return 'DASH preview may not play in the side panel; trim applies during muxing.';
  if (protocol === 'hls') return 'HLS preview may require the offscreen preview host; trim applies during muxing.';
  return '';
}

function buildRangeGradient(
  ranges: DownloadedRange[] | undefined,
  totalSec: number | undefined,
): string | undefined {
  if (!ranges || ranges.length === 0 || !totalSec || totalSec <= 0) return undefined;
  const stops: string[] = [];
  let cursor = 0;
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const startPct = Math.max(0, Math.min(100, (range.start / totalSec) * 100));
    const endPct = Math.max(0, Math.min(100, (range.end / totalSec) * 100));
    if (startPct > cursor) stops.push(`var(--surface-variant) ${cursor}% ${startPct}%`);
    stops.push(`var(--secondary) ${startPct}% ${endPct}%`);
    cursor = endPct;
  }
  if (cursor < 100) stops.push(`var(--surface-variant) ${cursor}% 100%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

function ReloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M8 3V1L4 4l4 3V5a3 3 0 1 1-3 3H3a5 5 0 1 0 5-5z" />
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
  browserRecordingAvailable = false,
  codecInfo = null,
  downloadedRanges,
  totalDurationSec,
  liveSegmentSource: _liveSegmentSource,
  onClose,
  onDownload,
  onDurationResolved,
}: PreviewModalProps) {
  const [trim, setTrim] = useState<MediaTrimSelection | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [directOutputMode, setDirectOutputMode] = useState<'original' | 'webm'>('original');
  const trimEnabled =
    protocol === 'hls' ||
    protocol === 'dash' ||
    (protocol === 'direct' &&
      (nativeHelperAvailable || (browserRecordingAvailable && directOutputMode === 'webm')));
  const note = previewNote(
    protocol,
    restrictedMessage,
    nativeHelperAvailable,
    directOutputMode,
  );

  const playerProtocol: 'hls' | 'dash' | 'direct' =
    protocol === 'hls' || protocol === 'dash' || protocol === 'direct' ? protocol : 'direct';

  function handleDuration(sec: number) {
    setVideoDuration(sec);
    onDurationResolved?.(sec);
  }

  const { videoRef, reload, key, playbackStrategy } = usePreviewPlayer({
    sourceUrl,
    protocol: playerProtocol,
    onDurationResolved: handleDuration,
  });

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  const codecUnsupported = useMemo(() => {
    if (!codecInfo || typeof document === 'undefined') return false;
    const probe = document.createElement('video');
    return !isCodecSupported(codecInfo, (mime) => probe.canPlayType(mime) as '' | 'maybe' | 'probably');
  }, [codecInfo]);

  const rangeGradient = buildRangeGradient(downloadedRanges, totalDurationSec);

  if (!open) return null;

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

        <div className="preview-modal__player">
          <VideoPlayer
            videoRef={videoRef}
            sourceUrl={sourceUrl}
            playerKey={key}
          />
        </div>

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

        {protocol === 'hls' ? (
          <p
            className="preview-modal__playback-strategy"
            data-testid="preview-playback-strategy"
            data-strategy={playbackStrategy}
          >
            {playbackStrategy === 'hls-js'
              ? 'Playing via hls.js (native HLS unsupported)'
              : 'Native HLS playback'}
          </p>
        ) : null}

        {note ? <p className="preview-modal__note">{note}</p> : null}

        {protocol === 'direct' && browserRecordingAvailable ? (
          <fieldset className="preview-modal__output-mode">
            <legend className="preview-modal__output-mode-title">Trim output</legend>
            <label className="preview-modal__output-mode-option">
              <input
                type="radio"
                name="direct-trim-output"
                checked={directOutputMode === 'original'}
                onChange={() => {
                  setDirectOutputMode('original');
                  setTrim(null);
                }}
              />
              Original trim
            </label>
            <label className="preview-modal__output-mode-option">
              <input
                type="radio"
                name="direct-trim-output"
                checked={directOutputMode === 'webm'}
                onChange={() => setDirectOutputMode('webm')}
              />
              Browser WebM clip
            </label>
          </fieldset>
        ) : null}

        <TrimSlider
          enabled={trimEnabled}
          duration={videoDuration}
          value={trim}
          onChange={setTrim}
        />

        <footer className="preview-modal__footer">
          <button
            type="button"
            className="preview-modal__download"
            onClick={() => {
              if (protocol === 'direct' && directOutputMode === 'webm') {
                onDownload(trim, { outputKind: 'webm' });
                return;
              }
              onDownload(trim);
            }}
          >
            Download Selection
          </button>
        </footer>
      </section>
    </div>
  );
}
