import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { DirectUrlPanel } from '../DirectUrlPanel';

describe('DirectUrlPanel', () => {
  test('submits typed URL/filename/referer/origin', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DirectUrlPanel onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('URL'), 'https://example.com/v.mp4');
    await user.type(screen.getByLabelText('Filename'), 'clip.mp4');
    await user.type(screen.getByLabelText('Referer'), 'https://example.com/');
    await user.type(screen.getByLabelText('Origin'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /start download/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      url: 'https://example.com/v.mp4',
      filename: 'clip.mp4',
      referer: 'https://example.com/',
      origin: 'https://example.com',
    });
  });

  test('renders pending result with stop button', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(
      <DirectUrlPanel
        onSubmit={() => {}}
        onStop={onStop}
        results={[{ id: 'j1', url: 'https://example.com/v', status: 'running' }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: /stop/i }));
    expect(onStop).toHaveBeenCalledWith('j1');
  });

  test('renders failed result with retry button', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <DirectUrlPanel
        onSubmit={() => {}}
        onRetry={onRetry}
        results={[
          { id: 'j2', url: 'https://example.com/v', status: 'failed', error: 'boom' },
        ]}
      />,
    );
    expect(screen.getByText('boom')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledWith('j2');
  });
});
