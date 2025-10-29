import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { QueueItem, type QueueViewItem } from '../QueueItem';

const baseItem: QueueViewItem = {
  id: 'job-1',
  title: 'Active job',
  status: 'running',
  progressPct: 25,
};

describe('QueueItem overflow menu', () => {
  test('does not render overflow menu when onCopyCommand absent', () => {
    render(<QueueItem item={baseItem} onAction={() => {}} />);
    expect(screen.queryByRole('button', { name: /more actions/i })).toBeNull();
  });

  test('invokes onCopyCommand with profile id and item id', async () => {
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
