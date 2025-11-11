import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { QueueItem, type QueueViewItem } from '../QueueItem';

const baseItem: QueueViewItem = {
  id: 'job-1',
  title: 'Sample clip.mp4',
  status: 'completed',
  progressPct: 100,
};

describe('QueueItem overflow menu', () => {
  test('renders overflow menu trigger', () => {
    render(<QueueItem item={baseItem} onAction={() => {}} />);

    expect(screen.getByRole('button', { name: /more actions/i })).toBeInTheDocument();
  });

  test('Save again is offered only for completed jobs and emits resave', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<QueueItem item={baseItem} onAction={onAction} />);

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /save again/i }));

    expect(onAction).toHaveBeenCalledWith('resave', 'job-1');
  });

  test('Save again is hidden for non-completed jobs', async () => {
    const user = userEvent.setup();
    render(
      <QueueItem
        item={{ ...baseItem, status: 'running', progressPct: 32 }}
        onAction={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.queryByRole('menuitem', { name: /save again/i })).not.toBeInTheDocument();
  });

  test('Remove from queue emits remove action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<QueueItem item={baseItem} onAction={onAction} />);

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /remove from queue/i }));

    expect(onAction).toHaveBeenCalledWith('remove', 'job-1');
  });

  test('Copy URL emits copy-url action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<QueueItem item={baseItem} onAction={onAction} />);

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /copy url/i }));

    expect(onAction).toHaveBeenCalledWith('copy-url', 'job-1');
  });

  test('Copy command emits generic copy-command action when no onCopyCommand provided', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<QueueItem item={baseItem} onAction={onAction} />);

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /copy command/i }));

    expect(onAction).toHaveBeenCalledWith('copy-command', 'job-1');
  });

  test('invokes onCopyCommand with profile id and item id when callback provided', async () => {
    const user = userEvent.setup();
    const onCopyCommand = vi.fn();
    render(
      <QueueItem
        item={baseItem}
        onAction={() => {}}
        onCopyCommand={onCopyCommand}
        commandProfileIds={['yt-dlp', 'ffmpeg']}
      />,
    );

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /copy yt-dlp command/i }));

    expect(onCopyCommand).toHaveBeenCalledWith('yt-dlp', 'job-1');
  });
});
