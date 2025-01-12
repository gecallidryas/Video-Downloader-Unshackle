import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidePanelApp } from '../SidePanelApp';
import { usePanelStore } from '@/src/state/usePanelStore';
import type { DetectedMedia } from '@/src/types/media';

beforeEach(() => {
  usePanelStore.setState({
    surfaceState: 'detecting',
    mediaItems: [],
    queueJobs: [],
    errorMessage: null,
    downloadingIds: new Set<string>(),
  });
});

test('renders the panel header with title', () => {
  render(<SidePanelApp />);
  expect(screen.getByText('Video Downloader')).toBeInTheDocument();
});

test('renders detecting state copy when runtime scan is in progress', () => {
  render(<SidePanelApp />);
  expect(screen.getByText(/detecting media on this page/i)).toBeInTheDocument();
});

test('renders empty state copy when no runtime media exists', () => {
  usePanelStore.setState({ surfaceState: 'empty' });
  render(<SidePanelApp />);
  expect(screen.getByText(/no media detected on this page/i)).toBeInTheDocument();
});

test('renders error state copy when runtime scan fails', () => {
  usePanelStore.setState({
    surfaceState: 'error',
    errorMessage: 'Could not inspect this page',
  });
  render(<SidePanelApp />);
  expect(screen.getByText(/could not inspect this page/i)).toBeInTheDocument();
});

test('renders protected-only state when only restricted media is present', () => {
  usePanelStore.setState({ surfaceState: 'protected_only' });
  render(<SidePanelApp />);
  expect(screen.getByText(/protected media detected/i)).toBeInTheDocument();
});

test('does not coerce results with zero items into the empty state', () => {
  usePanelStore.setState({
    surfaceState: 'results',
    mediaItems: [],
  });

  render(<SidePanelApp />);

  expect(screen.getByText('0 Files')).toBeInTheDocument();
  expect(screen.queryByText(/no media detected on this page/i)).not.toBeInTheDocument();
});

test('renders runtime results and updates after removing the last item', async () => {
  const user = userEvent.setup();
  const runtimeItem: DetectedMedia = {
    id: 'runtime-1',
    title: 'Runtime Candidate Example',
    format: 'MP4',
    size: '12 MB',
    duration: '00:42',
    mediaType: 'video',
    qualities: [{ label: '720p', value: '720p' }],
    selectedQuality: '720p',
  };

  usePanelStore.setState({
    surfaceState: 'results',
    mediaItems: [runtimeItem],
  });

  render(<SidePanelApp />);
  expect(screen.getByText('Runtime Candidate Example')).toBeInTheDocument();
  expect(screen.getByText('1 File')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /remove/i }));

  expect(screen.queryByText('Runtime Candidate Example')).not.toBeInTheDocument();
  expect(screen.getByText(/no media detected on this page/i)).toBeInTheDocument();
});

test('renders bottom nav with history, current, and settings icons', () => {
  render(<SidePanelApp />);
  expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /current/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
});

test('opens the queue tab from the flat bottom nav', async () => {
  const user = userEvent.setup();

  render(<SidePanelApp />);
  await user.click(screen.getByRole('button', { name: /queue/i }));

  expect(
    screen.getByRole('tablist', { name: /queue status/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /active 0/i })).toBeInTheDocument();
});
