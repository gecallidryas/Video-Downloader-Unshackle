import { useMemo } from 'react';
import { generateQrMatrix, isUrlSafeForQr } from '@/src/core/qr/generate-qr-matrix';

interface QRModalProps {
  url: string;
  open: boolean;
  onClose: () => void;
}

const MODULE_SIZE = 6;
const PADDING = 4;

export function QRModal({ url, open, onClose }: QRModalProps) {
  const safe = useMemo(() => isUrlSafeForQr(url), [url]);
  const matrix = useMemo(() => (open && safe ? generateQrMatrix(url) : null), [open, safe, url]);

  if (!open) return null;

  const size = matrix ? matrix.length * MODULE_SIZE + PADDING * 2 : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share QR code"
      className="qr-modal"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        zIndex: 100,
      }}
    >
      <div
        className="qr-modal__panel"
        style={{
          background: 'var(--surface-container-high, #1f1f1f)',
          color: 'var(--on-surface, #fff)',
          padding: 16,
          borderRadius: 8,
          maxWidth: 360,
          width: '100%',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <strong>Share via QR</strong>
          <button type="button" aria-label="Close QR" onClick={onClose}>
            ×
          </button>
        </header>
        {!safe ? (
          <p role="alert" className="qr-modal__warning">
            This URL contains authentication tokens and is not safe to share via QR.
          </p>
        ) : matrix ? (
          <svg
            role="img"
            aria-label={`QR code for ${url}`}
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{ background: '#fff' }}
          >
            {matrix.map((row, y) =>
              row.map((cell, x) =>
                cell ? (
                  <rect
                    key={`${x}-${y}`}
                    x={PADDING + x * MODULE_SIZE}
                    y={PADDING + y * MODULE_SIZE}
                    width={MODULE_SIZE}
                    height={MODULE_SIZE}
                    fill="#000"
                  />
                ) : null,
              ),
            )}
          </svg>
        ) : null}
        <p style={{ wordBreak: 'break-all', marginTop: 12, fontSize: 12 }}>{url}</p>
      </div>
    </div>
  );
}
