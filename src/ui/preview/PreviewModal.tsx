import { useEffect, useState } from 'react';
import { TrimControls } from '@/src/ui/media/TrimControls';
import type { MediaTrimSelection } from '@/src/types/media';
import type { StreamProtocol } from '@/video_downloader_types_skeleton';
import './PreviewModal.css';

interface PreviewModalProps {
  open: boolean;
  title: string;
  sourceUrl: string;
  protocol: StreamProtocol;
  restrictedMessage?: string;
  onClose: () => void;
  onDownload: (trim: MediaTrimSelection | null) => void;
}

function previewNote(protocol: StreamProtocol, restrictedMessage?: string): string {
  if (restrictedMessage) {
    return restrictedMessage;
  }

  if (protocol === 'direct') {
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

export function PreviewModal({
  open,
  title,
  sourceUrl,
  protocol,
  restrictedMessage,
  onClose,
  onDownload,
}: PreviewModalProps) {
  const [trim, setTrim] = useState<MediaTrimSelection | null>(null);
  const trimEnabled = protocol === 'hls' || protocol === 'dash';
  const note = previewNote(protocol, restrictedMessage);

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
          <button
            type="button"
            className="preview-modal__close"
            aria-label="Close preview"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <video
          className="preview-modal__video"
          aria-label="Preview video"
          src={sourceUrl}
          controls
          preload="metadata"
        />

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
