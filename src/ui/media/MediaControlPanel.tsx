import type { MediaControlBridge, MediaControlCommand } from '@/src/content/media-control-bridge';

interface MediaControlPanelProps {
  bridge: MediaControlBridge;
  advancedMode: boolean;
}

const buttonStyle = {
  padding: '6px 10px',
  fontSize: 13,
  background: 'var(--surface-variant, #2a2a2a)',
  color: 'var(--on-surface, #fff)',
  border: '1px solid var(--outline-variant, #444)',
  borderRadius: 4,
  cursor: 'pointer',
};

export function MediaControlPanel({ bridge, advancedMode }: MediaControlPanelProps) {
  if (!advancedMode) {
    return null;
  }
  const dispatch = (command: MediaControlCommand) => {
    void bridge.send(command);
  };
  return (
    <section
      className="media-control-panel"
      aria-label="Media controls"
      style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
    >
      <button type="button" style={buttonStyle} onClick={() => dispatch({ type: 'play' })}>
        Play
      </button>
      <button type="button" style={buttonStyle} onClick={() => dispatch({ type: 'pause' })}>
        Pause
      </button>
      <button type="button" style={buttonStyle} onClick={() => dispatch({ type: 'toggle-pip' })}>
        PiP
      </button>
      <button
        type="button"
        style={buttonStyle}
        onClick={() => dispatch({ type: 'screenshot' })}
      >
        Screenshot
      </button>
      <button
        type="button"
        style={buttonStyle}
        onClick={() => dispatch({ type: 'seek', deltaSeconds: -10 })}
      >
        -10s
      </button>
      <button
        type="button"
        style={buttonStyle}
        onClick={() => dispatch({ type: 'seek', deltaSeconds: 10 })}
      >
        +10s
      </button>
    </section>
  );
}
