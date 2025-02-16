export type NativeHelperUiStatus = 'not-checked' | 'connected' | 'missing' | 'ffmpeg-missing';

interface NativeHelperStatusProps {
  status: NativeHelperUiStatus;
  onCheck?: () => void;
}

function statusLabel(status: NativeHelperUiStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'missing':
      return 'Not installed';
    case 'ffmpeg-missing':
      return 'FFmpeg not found';
    case 'not-checked':
    default:
      return 'Not checked';
  }
}

export function NativeHelperStatus({ status, onCheck }: NativeHelperStatusProps) {
  return (
    <div className="native-helper-status">
      <div>
        <span className="native-helper-status__label">Native FFmpeg helper</span>
        <span className="native-helper-status__value">{statusLabel(status)}</span>
      </div>
      {onCheck ? (
        <button type="button" className="native-helper-status__check" onClick={onCheck}>
          Check helper
        </button>
      ) : null}
    </div>
  );
}
