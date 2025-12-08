import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SidePanelApp } from '../SidePanelApp';
import { usePanelStore } from '@/src/state/usePanelStore';
import type { RuntimeClient } from '@/src/lib/runtime/client';
import type { DetectedMedia } from '@/src/types/media';
import type { MediaCandidate } from '@/video_downloader_types_skeleton';

function buildCandidate(
  overrides: Partial<MediaCandidate> = {},
): MediaCandidate {
  return {
    id: 'candidate-1',
    tabId: 7,
    mediaKind: 'video',
    protocol: 'direct',
    status: 'ready',
    pageUrl: 'https://example.com/watch',
    pageTitle: 'Example page',
    origin: 'https://example.com',
    displayName: 'Clear runtime video',
    sourceUrl: 'https://cdn.example.com/video.mp4',
    mimeType: 'video/mp4',
    fileExtensionHint: 'mp4',
    durationSec: 95,
    sizeEstimateBytes: 24_000_000,
    protection: { kind: 'none' },
    variants: [{ id: '720p', height: 720, isDefault: true }],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [],
    preview: { playable: true, adapter: 'native' },
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function buildRuntimeClient(candidates: MediaCandidate[]): RuntimeClient {
  return {
    getCandidates: vi.fn().mockResolvedValue(candidates),
    ingestManualHls: vi.fn().mockResolvedValue([]),
    getQueueStats: vi.fn().mockResolvedValue({
      queued: 0,
      running: 0,
      failed: 0,
      completed: 0,
    }),
    requestHostAccess: vi.fn().mockResolvedValue({
      granted: true,
      origin: 'https://example.com',
    }),
    getDebugEvidence: vi.fn().mockResolvedValue([]),
    getPreviewAsset: vi.fn().mockResolvedValue({
      assetUrl: 'preview.webm',
      mimeType: 'video/webm',
      generated: true,
    }),
    getThumbnailAsset: vi.fn().mockResolvedValue({
      assetUrl: 'thumb.jpg',
      mimeType: 'image/jpeg',
      generated: true,
    }),
    startDownload: vi.fn().mockResolvedValue({
      id: 'job-1',
      candidateId: candidates[0]?.id ?? 'candidate-1',
      tabId: 7,
      phase: 'queued',
      createdAt: 1,
      updatedAt: 1,
      selection: { mode: 'custom' },
      progressPct: 0,
      bytesDownloaded: 0,
    }),
  };
}

beforeEach(() => {
  globalThis.localStorage?.removeItem('unshackle:sidepanel:activeTab');
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

  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /^remove$/i }));

  expect(screen.queryByText('Runtime Candidate Example')).not.toBeInTheDocument();
  expect(screen.getByText(/no media detected on this page/i)).toBeInTheDocument();
});

test('renders bottom nav with downloads, current, and settings icons', () => {
  render(<SidePanelApp />);
  expect(screen.getByRole('button', { name: /downloads/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /current/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
});

test('opens the downloads tab from the bottom nav', async () => {
  const user = userEvent.setup();

  render(<SidePanelApp />);
  await user.click(screen.getByRole('button', { name: /downloads/i }));

  expect(
    screen.getByRole('tablist', { name: /download status/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /active 0/i })).toBeInTheDocument();
});

test('persists active tab to localStorage', async () => {
  const user = userEvent.setup();
  globalThis.localStorage.removeItem('unshackle:sidepanel:activeTab');

  render(<SidePanelApp />);
  await user.click(screen.getByRole('button', { name: /downloads/i }));

  expect(globalThis.localStorage.getItem('unshackle:sidepanel:activeTab')).toBe(
    'downloads',
  );
});

test('reads persisted active tab on mount', () => {
  globalThis.localStorage.setItem('unshackle:sidepanel:activeTab', 'downloads');

  render(<SidePanelApp />);

  expect(screen.getByRole('tablist', { name: /download status/i })).toBeInTheDocument();
  globalThis.localStorage.removeItem('unshackle:sidepanel:activeTab');
});

test('migrates old history/queue tab values to downloads', () => {
  globalThis.localStorage.setItem('unshackle:sidepanel:activeTab', 'history');

  render(<SidePanelApp />);

  expect(screen.getByRole('tablist', { name: /download status/i })).toBeInTheDocument();
  globalThis.localStorage.removeItem('unshackle:sidepanel:activeTab');
});

test('renders media cards directly in results view without filter UI', () => {
  usePanelStore.setState({
    surfaceState: 'results',
    mediaItems: [
      {
        id: 'a',
        title: 'Hello.mp4',
        format: 'MP4',
        size: '1 MB',
        duration: '00:10',
        mediaType: 'video',
        qualities: [],
        selectedQuality: '',
      },
    ],
  });

  render(<SidePanelApp />);

  expect(screen.getByText('Hello.mp4')).toBeInTheDocument();
  expect(screen.queryByRole('searchbox', { name: /filter streams/i })).not.toBeInTheDocument();
});

test('labels HLS browser fallback as raw TS instead of MP4', async () => {
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'hls-raw',
      protocol: 'hls',
      displayName: 'Raw HLS stream',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/master.m3u8',
      mimeType: 'application/vnd.apple.mpegurl',
      fileExtensionHint: undefined,
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Raw HLS stream')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /save raw ts/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /download mp4/i })).not.toBeInTheDocument();
});

test('labels DASH browser fallback as raw segments instead of MP4', async () => {
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'dash-raw',
      protocol: 'dash',
      displayName: 'Raw DASH stream',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/manifest.mpd',
      mimeType: 'application/dash+xml',
      fileExtensionHint: undefined,
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Raw DASH stream')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /save raw segments/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /download mp4/i })).not.toBeInTheDocument();
});

test('does not show a broken preview spinner when browser preview is unavailable', async () => {
  const user = userEvent.setup();
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'hls-preview-unavailable',
      protocol: 'hls',
      displayName: 'HLS with no generated preview',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/master.m3u8',
      posterUrl: undefined,
      thumbnails: undefined,
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('HLS with no generated preview')).toBeInTheDocument();
  await user.hover(screen.getByTestId('media-thumb'));

  expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument();
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  expect(runtimeClient.getPreviewAsset).not.toHaveBeenCalled();
});
