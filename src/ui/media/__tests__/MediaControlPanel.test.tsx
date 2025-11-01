import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MediaControlPanel } from '../MediaControlPanel';
import { createMediaControlBridge } from '@/src/content/media-control-bridge';

describe('MediaControlPanel', () => {
  test('returns null when advancedMode is false', () => {
    const { container } = render(
      <MediaControlPanel
        bridge={createMediaControlBridge({ dispatch: async () => {} })}
        advancedMode={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('dispatches play/pause/screenshot/seek through bridge', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn(async () => {});
    const bridge = createMediaControlBridge({ dispatch });
    render(<MediaControlPanel bridge={bridge} advancedMode />);

    await user.click(screen.getByRole('button', { name: /^play$/i }));
    await user.click(screen.getByRole('button', { name: /^pause$/i }));
    await user.click(screen.getByRole('button', { name: /pip/i }));
    await user.click(screen.getByRole('button', { name: /screenshot/i }));
    await user.click(screen.getByRole('button', { name: /-10s/i }));
    await user.click(screen.getByRole('button', { name: /\+10s/i }));

    expect(dispatch).toHaveBeenCalledTimes(6);
    expect(dispatch.mock.calls.map((call) => call[0])).toEqual([
      { type: 'play' },
      { type: 'pause' },
      { type: 'toggle-pip' },
      { type: 'screenshot' },
      { type: 'seek', deltaSeconds: -10 },
      { type: 'seek', deltaSeconds: 10 },
    ]);
  });
});
