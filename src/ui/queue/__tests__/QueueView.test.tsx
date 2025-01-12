import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { QueueView, type QueueViewItem } from '../QueueView';

const items: QueueViewItem[] = [
  {
    id: 'job-running',
    title: 'Active stream',
    status: 'running',
    progressPct: 48,
    statusText: 'Fetching segments',
  },
  {
    id: 'job-pending',
    title: 'Queued clip',
    status: 'pending',
    progressPct: 0,
  },
  {
    id: 'job-failed',
    title: 'Failed clip',
    status: 'failed',
    progressPct: 12,
    error: 'Network error',
  },
  {
    id: 'job-completed',
    title: 'Completed clip',
    status: 'completed',
    progressPct: 100,
    outputLabel: 'clip.mp4',
  },
];

test('renders queue status tabs and running progress', () => {
  render(<QueueView items={items} onAction={() => {}} />);

  expect(screen.getByRole('tab', { name: /pending 1/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /active 1/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /failed 1/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /completed 1/i })).toBeInTheDocument();

  const activeItem = screen.getByText('Active stream').closest('.queue-item');
  expect(activeItem).not.toBeNull();
  expect(within(activeItem as HTMLElement).getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '48',
  );
});

test('shows retry and open output actions for terminal queue items', async () => {
  const user = userEvent.setup();
  const onAction = vi.fn();

  render(<QueueView items={items} onAction={onAction} />);

  await user.click(screen.getByRole('tab', { name: /failed/i }));
  await user.click(screen.getByRole('button', { name: /retry failed clip/i }));
  expect(onAction).toHaveBeenCalledWith('retry', 'job-failed');

  await user.click(screen.getByRole('tab', { name: /completed/i }));
  await user.click(screen.getByRole('button', { name: /open completed clip/i }));
  expect(onAction).toHaveBeenCalledWith('open', 'job-completed');
});
