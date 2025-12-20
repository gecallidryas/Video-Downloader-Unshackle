import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { QueueView, type QueueViewItem } from '../QueueView';
import type { HistoryRow } from '../QueueView';

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
];

const history: HistoryRow[] = [
  {
    id: 'hist-1',
    displayName: 'Finished video',
    protocol: 'hls',
    status: 'completed',
    fileSizeBytes: 52_000_000,
    pageTitle: 'Example Page',
    createdAt: Date.now(),
  },
];

test('renders 3 download status tabs with correct counts', () => {
  render(<QueueView items={items} historyRecords={history} onAction={() => {}} />);

  expect(screen.getByRole('tab', { name: /active 2/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /failed 1/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /completed 1/i })).toBeInTheDocument();
});

test('active tab shows running and pending items with progress', () => {
  render(<QueueView items={items} historyRecords={history} onAction={() => {}} />);

  const activeItem = screen.getByText('Active stream').closest('.queue-item');
  expect(activeItem).not.toBeNull();
  expect(within(activeItem as HTMLElement).getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '48',
  );
  expect(screen.getByText('Queued clip')).toBeInTheDocument();
});

test('completed tab shows history records', async () => {
  const user = userEvent.setup();
  render(<QueueView items={items} historyRecords={history} onAction={() => {}} />);

  await user.click(screen.getByRole('tab', { name: /completed/i }));
  expect(screen.getByText('Finished video')).toBeInTheDocument();
  expect(screen.getByText('HLS')).toBeInTheDocument();
  expect(screen.getByText(/52 MB/)).toBeInTheDocument();
});

test('failed tab shows retry action', async () => {
  const user = userEvent.setup();
  const onAction = vi.fn();
  render(<QueueView items={items} historyRecords={history} onAction={onAction} />);

  await user.click(screen.getByRole('tab', { name: /failed/i }));
  await user.click(screen.getByRole('button', { name: /retry failed clip/i }));
  expect(onAction).toHaveBeenCalledWith('retry', 'job-failed');
});
