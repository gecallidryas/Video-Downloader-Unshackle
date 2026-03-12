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

  test('renders playable MP4 output filename, MIME type, and notes', () => {
    render(
      <QueueItem
        item={{
          ...baseItem,
          outputLabel: 'stream.mp4',
          outputMimeType: 'video/mp4',
          notes: ['Browser transmuxed MPEG-TS HLS segments to MP4.'],
        }}
        onAction={() => {}}
      />,
    );

    expect(screen.getByText('stream.mp4')).toBeInTheDocument();
    expect(screen.getByText('video/mp4')).toBeInTheDocument();
    expect(screen.getByText(/transmuxed mpeg-ts hls segments to mp4/i)).toBeInTheDocument();
  });

  test('renders raw DASH and browser-recorded trim outputs honestly', () => {
    const { rerender } = render(
      <QueueItem
        item={{
          ...baseItem,
          outputLabel: 'segments.bin',
          outputMimeType: 'application/octet-stream',
          notes: ['Raw DASH segments; native or muxing is required for a final MP4.'],
        }}
        onAction={() => {}}
      />,
    );

    expect(screen.getByText('segments.bin')).toBeInTheDocument();
    expect(screen.getByText('application/octet-stream')).toBeInTheDocument();
    expect(screen.getByText(/raw dash segments/i)).toBeInTheDocument();

    rerender(
      <QueueItem
        item={{
          ...baseItem,
          outputLabel: 'Direct video.trim.webm',
          outputMimeType: 'video/webm',
          notes: ['Browser-recorded WebM clip; not an original-quality stream copy.'],
        }}
        onAction={() => {}}
      />,
    );

    expect(screen.getByText('Direct video.trim.webm')).toBeInTheDocument();
    expect(screen.getByText('video/webm')).toBeInTheDocument();
    expect(screen.getByText(/browser-recorded webm clip/i)).toBeInTheDocument();
  });

  test('renders HLS segment status controls and emits retry/range actions', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onSegmentRetry = vi.fn();
    render(
      <QueueItem
        item={{
          ...baseItem,
          status: 'failed',
          segments: [
            { index: 0, status: 'done' },
            { index: 1, status: 'failed' },
          ],
          selectedSegmentRange: { start: 0, end: 1 },
        }}
        onAction={onAction}
        onSegmentRetry={onSegmentRetry}
      />,
    );

    await user.click(screen.getByRole('gridcell', { name: /segment 1 failed/i }));
    await user.click(screen.getByRole('button', { name: /retry failed segments/i }));
    await user.click(screen.getByRole('button', { name: /export selected range/i }));

    expect(onSegmentRetry).toHaveBeenCalledWith('job-1', 1);
    expect(onAction).toHaveBeenCalledWith('retry-failed-segments', 'job-1');
    expect(onAction).toHaveBeenCalledWith('export-partial', 'job-1');
  });
});
