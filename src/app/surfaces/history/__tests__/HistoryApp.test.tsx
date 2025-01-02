import { render, screen } from '@testing-library/react';
import { HistoryApp } from '../HistoryApp';
import { useHistoryStore } from '@/src/state/useHistoryStore';
import type { HistoryRecord } from '@/video_downloader_types_skeleton';

beforeEach(() => {
  useHistoryStore.setState({ records: [] });
});

test('renders the history page header', () => {
  render(<HistoryApp />);
  expect(screen.getByText(/download history/i)).toBeInTheDocument();
});

test('renders empty state when runtime history is empty', () => {
  render(<HistoryApp />);
  expect(screen.getByText(/no downloads yet/i)).toBeInTheDocument();
  expect(screen.getByText(/downloaded media will appear here/i)).toBeInTheDocument();
});

test('renders runtime history records when data exists', () => {
  const runtimeRecord: HistoryRecord = {
    id: 'history-1',
    displayName: 'Runtime Download Result',
    mediaKind: 'video',
    protocol: 'direct',
    pageUrl: 'https://example.com/watch',
    pageTitle: 'Runtime Source',
    status: 'completed',
    fileName: 'runtime-download.mp4',
    fileSizeBytes: 12_000_000,
    createdAt: Date.UTC(2026, 3, 25),
    updatedAt: Date.UTC(2026, 3, 25),
  };

  useHistoryStore.setState({ records: [runtimeRecord] });
  render(<HistoryApp />);
  expect(screen.getByText('Runtime Download Result')).toBeInTheDocument();
  expect(screen.getByText('Runtime Source')).toBeInTheDocument();
  expect(screen.getByText('DIRECT')).toBeInTheDocument();
  expect(screen.getByText(/completed/i)).toBeInTheDocument();
});

test('renders record count', () => {
  render(<HistoryApp />);
  expect(screen.getByText(/0 records/i)).toBeInTheDocument();
});
