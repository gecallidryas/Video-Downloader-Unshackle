import { useState } from 'react';
import type { NativeHelperDiagnostic } from '@/src/native/native-helper-diagnostics';

interface NativeHelperStatusProps {
  diagnostic: NativeHelperDiagnostic;
  onCheck?: () => void;
  onRequestPermission?: () => void;
  onOpenSetup?: () => void;
  busy?: boolean;
}

function statusLabel(status: NativeHelperDiagnostic['readiness']): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'permission-needed':
      return 'Permission needed';
    case 'permission-denied':
      return 'Permission denied';
    case 'host-missing':
    case 'host-forbidden':
      return 'Install helper';
    case 'ffmpeg-missing':
      return 'FFmpeg missing';
    case 'error':
      return 'Error';
    case 'not-checked':
    default:
      return 'Not checked';
  }
}

function primaryAction(
  readiness: NativeHelperDiagnostic['readiness'],
): 'check' | 'permission' | 'setup' | 'recheck' {
  switch (readiness) {
    case 'permission-needed':
    case 'permission-denied':
      return 'permission';
    case 'host-missing':
    case 'host-forbidden':
      return 'setup';
    case 'ready':
    case 'ffmpeg-missing':
    case 'error':
      return 'recheck';
    case 'not-checked':
    default:
      return 'check';
  }
}

export function NativeHelperStatus({
  diagnostic,
  onCheck,
  onRequestPermission,
  onOpenSetup,
  busy = false,
}: NativeHelperStatusProps) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const action = primaryAction(diagnostic.readiness);

  return (
    <div className="native-helper-status">
      <div>
        <span className="native-helper-status__label">Native FFmpeg helper</span>
        <span className="native-helper-status__value">{statusLabel(diagnostic.readiness)}</span>
      </div>
      <div className="native-helper-status__actions">
        {action === 'permission' ? (
          <button
            type="button"
            className="native-helper-status__check"
            onClick={onRequestPermission}
            disabled={busy}
          >
            Enable native helper
          </button>
        ) : null}
        {action === 'setup' ? (
          <button
            type="button"
            className="native-helper-status__check"
            onClick={onOpenSetup}
          >
            Open setup
          </button>
        ) : null}
        {onCheck ? (
          <button
            type="button"
            className="native-helper-status__check"
            onClick={onCheck}
            disabled={busy}
          >
            {action === 'check' ? 'Check helper' : 'Check again'}
          </button>
        ) : null}
        <button
          type="button"
          className="native-helper-status__check"
          onClick={() => setShowDiagnostics((value) => !value)}
        >
          Diagnostics
        </button>
      </div>
      {showDiagnostics ? (
        <div className="native-helper-status__diagnostics">
          <input aria-label="Readiness code" readOnly value={diagnostic.readiness} />
          <input aria-label="Host code" readOnly value={diagnostic.hostName} />
        </div>
      ) : null}
    </div>
  );
}
