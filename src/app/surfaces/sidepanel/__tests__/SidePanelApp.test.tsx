import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SidePanelApp } from '../SidePanelApp';
import { usePanelStore } from '@/src/state/usePanelStore';
import { useSettingsStore } from '@/src/state/useSettingsStore';
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
    cancelDownload: vi.fn().mockResolvedValue({ cancelled: true }),
    retrySegment: vi.fn().mockResolvedValue(undefined),
    retryFailedSegments: vi.fn().mockResolvedValue(undefined),
    exportPartialHls: vi.fn().mockResolvedValue(undefined),
    updateHlsSegmentRange: vi.fn().mockResolvedValue(undefined),
    getAllCandidates: vi.fn().mockResolvedValue(candidates),
    getJobs: vi.fn().mockResolvedValue([]),
    retryDownload: vi.fn().mockResolvedValue(undefined),
    resaveDownload: vi.fn().mockResolvedValue(undefined),
    removeDownload: vi.fn().mockResolvedValue(true),
    clearCompletedDownloads: vi.fn().mockResolvedValue([]),
    pauseAllDownloads: vi.fn().mockResolvedValue([]),
    ingestDirectUrl: vi.fn().mockResolvedValue({
      id: 'manual-job',
      candidateId: 'manual-direct',
      tabId: 7,
      phase: 'queued',
      createdAt: 1,
      updatedAt: 1,
      selection: { mode: 'best' },
      progressPct: 0,
      bytesDownloaded: 0,
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
  vi.useRealTimers();
  globalThis.localStorage?.removeItem('unshackle:sidepanel:activeTab');
  usePanelStore.setState({
    surfaceState: 'detecting',
    mediaItems: [],
    queueJobs: [],
    errorMessage: null,
    downloadingIds: new Set<string>(),
  });
  useSettingsStore.setState({
    enableNativeFeatures: true,
    enableBrowserFallbacks: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
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

test('labels HLS browser fallback primary action as Download', async () => {
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
  expect(screen.getByRole('button', { name: /^download$/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /save raw ts/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /download mp4/i })).not.toBeInTheDocument();
});

test('refreshes current tab candidates while the side panel stays open', async () => {
  vi.useFakeTimers();
  const runtimeClient = buildRuntimeClient([]);
  vi.mocked(runtimeClient.getCandidates)
    .mockResolvedValueOnce([
      buildCandidate({ id: 'initial', displayName: 'Initial stream' }),
    ])
    .mockResolvedValueOnce([
      buildCandidate({ id: 'initial', displayName: 'Initial stream' }),
      buildCandidate({ id: 'later', displayName: 'Later stream' }),
    ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText('Initial stream')).toBeInTheDocument();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_500);
  });

  expect(screen.getByText('Later stream')).toBeInTheDocument();
});

test('labels DASH browser fallback primary action as Download', async () => {
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
  expect(screen.getByRole('button', { name: /^download$/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /save raw segments/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /download mp4/i })).not.toBeInTheDocument();
});

test('does not show a broken preview spinner when browser preview is unavailable', async () => {
  const user = userEvent.setup();
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'dash-preview-unavailable',
      protocol: 'dash',
      displayName: 'DASH with no generated preview',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/manifest.mpd',
      posterUrl: undefined,
      thumbnails: undefined,
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('DASH with no generated preview')).toBeInTheDocument();
  await user.hover(screen.getByTestId('media-thumb'));

  expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument();
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  expect(runtimeClient.getPreviewAsset).not.toHaveBeenCalled();
});

test('opens HLS preview directly through browser playback when native features are disabled', async () => {
  const user = userEvent.setup();
  useSettingsStore.setState({ enableNativeFeatures: false, enableBrowserFallbacks: true });
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'hls-browser-preview',
      protocol: 'hls',
      displayName: 'Browser HLS stream',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/master.m3u8',
      posterUrl: undefined,
      thumbnails: undefined,
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Browser HLS stream')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /preview/i }));

  expect(runtimeClient.getPreviewAsset).not.toHaveBeenCalled();
  expect(await screen.findByRole('dialog', { name: /preview browser hls stream/i }))
    .toBeInTheDocument();
  expect(screen.getByLabelText(/preview video/i)).toHaveAttribute(
    'src',
    'https://cdn.example.com/master.m3u8',
  );
});

test('loads direct thumbnails through browser fallback when native features are disabled', async () => {
  useSettingsStore.setState({ enableNativeFeatures: false, enableBrowserFallbacks: true });
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'direct-thumb',
      protocol: 'direct',
      displayName: 'Direct thumbnail stream',
      posterUrl: undefined,
      thumbnails: undefined,
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Direct thumbnail stream')).toBeInTheDocument();
  expect(await screen.findByAltText(/direct thumbnail stream thumbnail/i))
    .toHaveAttribute('src', 'thumb.jpg');
  expect(runtimeClient.getThumbnailAsset).toHaveBeenCalledWith('direct-thumb');
});

test('download queue cancel and copy URL actions are wired to runtime and clipboard', async () => {
  const user = userEvent.setup();
  const runtimeClient = buildRuntimeClient([buildCandidate()]);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  globalThis.localStorage.setItem('unshackle:sidepanel:activeTab', 'downloads');
  usePanelStore.setState({
    mediaItems: [
      {
        id: 'candidate-1',
        title: 'Queued stream',
        format: 'MP4',
        size: '1 MB',
        duration: '00:10',
        mediaType: 'video',
        qualities: [],
        selectedQuality: '',
      },
    ],
    queueJobs: [
      {
        id: 'job-1',
        candidateId: 'candidate-1',
        tabId: 7,
        phase: 'fetching',
        createdAt: 1,
        updatedAt: 1,
        selection: { mode: 'custom' },
        progressPct: 12,
        bytesDownloaded: 0,
        output: {
          fileName: 'queued.mp4',
          mimeType: 'video/mp4',
          outputUrl: 'blob:queued-file',
        },
      },
    ],
  });

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  await user.click(screen.getByRole('button', { name: /cancel queued stream/i }));
  expect(runtimeClient.cancelDownload).toHaveBeenCalledWith('job-1');

  await user.click(screen.getByRole('tab', { name: /failed 1/i }));
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /copy url/i }));

  expect(writeText).toHaveBeenCalledWith('blob:queued-file');
});

test('current media copy URL action writes the browser fallback source URL', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'copy-hls',
      protocol: 'hls',
      displayName: 'Copyable HLS stream',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/copy/master.m3u8',
      variants: [{ id: 'media-playlist', isDefault: true }],
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Copyable HLS stream')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /quality/i })).toHaveDisplayValue('Auto');
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /copy video url/i }));

  expect(writeText).toHaveBeenCalledWith('https://cdn.example.com/copy/master.m3u8');
});

test('current media Share QR action opens the safe QR modal', async () => {
  const user = userEvent.setup();
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'share-direct',
      displayName: 'Shareable direct stream',
      sourceUrl: 'https://cdn.example.com/share/video.mp4',
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Shareable direct stream')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /share qr/i }));

  expect(screen.getByRole('dialog', { name: /share qr code/i })).toBeInTheDocument();
  expect(screen.getByText('https://cdn.example.com/share/video.mp4')).toBeInTheDocument();
});

test('Resolve filename action performs a user-initiated HEAD and previews the remote filename', async () => {
  const user = userEvent.setup();
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    new Response('', {
      headers: { 'content-disposition': 'attachment; filename="remote-video.mp4"' },
    }),
  );
  vi.stubGlobal('fetch', fetchImpl);
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'filename-direct',
      displayName: 'Filename direct stream',
      sourceUrl: 'https://cdn.example.com/download',
      fileExtensionHint: 'mp4',
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Filename direct stream')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /resolve filename/i }));

  expect(await screen.findByText('→ remote-video.mp4')).toBeInTheDocument();
  expect(fetchImpl).toHaveBeenCalledWith('https://cdn.example.com/download', {
    method: 'HEAD',
    redirect: 'follow',
    credentials: 'include',
  });
});

test('advanced tool panel exposes demo media and media controls', async () => {
  const user = userEvent.setup();
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', { tabs: { sendMessage } });
  useSettingsStore.setState({ advancedMode: true });
  const runtimeClient = buildRuntimeClient([]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  await user.click(screen.getByRole('button', { name: /manual ingest tools/i }));
  await user.click(screen.getByRole('button', { name: /add demo media/i }));
  expect(screen.getAllByText('Browser fallback demo direct video').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Browser fallback demo HLS').length).toBeGreaterThan(0);

  await user.click(screen.getByRole('button', { name: /^play$/i }));
  expect(sendMessage).toHaveBeenCalledWith(7, {
    type: 'media-control',
    command: { type: 'play' },
  });
});

test('advanced tool panel mounts preview grid and direct URL panel with real actions', async () => {
  const user = userEvent.setup();
  useSettingsStore.setState({ advancedMode: true });
  const runtimeClient = buildRuntimeClient([
    buildCandidate({ id: 'grid-1', displayName: 'Grid one', sourceUrl: 'https://cdn.example.com/a.mp4' }),
    buildCandidate({ id: 'grid-2', displayName: 'Grid two', sourceUrl: 'https://cdn.example.com/b.mp4' }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Grid one')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /manual ingest tools/i }));
  expect(screen.getByLabelText(/preview grid/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/manual download/i)).toBeInTheDocument();

  await user.click(screen.getByRole('checkbox', { name: /select grid one/i }));
  await user.click(screen.getByRole('button', { name: /download selected/i }));
  expect(runtimeClient.startDownload).toHaveBeenCalledWith('grid-1', expect.objectContaining({ mode: 'custom' }));

  await user.type(screen.getByRole('textbox', { name: /^url$/i }), 'https://cdn.example.com/manual.mp4');
  await user.click(screen.getByRole('button', { name: /start download/i }));
  expect(runtimeClient.ingestDirectUrl).toHaveBeenCalledWith(expect.objectContaining({
    tabId: 7,
    url: 'https://cdn.example.com/manual.mp4',
  }));
});

test('all tabs view loads candidates across tabs and recent mode expands older entries', async () => {
  const user = userEvent.setup();
  const current = buildCandidate({ id: 'current', displayName: 'Current item', tabId: 7 });
  const older = Array.from({ length: 21 }, (_, index) =>
    buildCandidate({
      id: `all-${index}`,
      tabId: index + 10,
      displayName: `All item ${index}`,
      createdAt: index,
      updatedAt: index,
    }),
  );
  const runtimeClient = buildRuntimeClient([current]);
  vi.mocked(runtimeClient.getAllCandidates).mockResolvedValue([current, ...older]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  await user.click(await screen.findByRole('tab', { name: /all tabs/i }));
  expect(await screen.findByText('All item 20')).toBeInTheDocument();
  expect(runtimeClient.getAllCandidates).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('checkbox', { name: /recent only/i }));
  expect(screen.queryByText('All item 0')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /show 2 more/i }));
  expect(screen.getByText('All item 0')).toBeInTheDocument();
});

test('duplicate URL and filename groups are passed to media cards', async () => {
  const runtimeClient = buildRuntimeClient([
    buildCandidate({ id: 'dup-a', displayName: 'Same.mp4', sourceUrl: 'https://cdn.example.com/same.mp4' }),
    buildCandidate({ id: 'dup-b', displayName: 'Same.mp4', sourceUrl: 'https://cdn.example.com/same.mp4' }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findAllByText(/2 duplicates/i)).toHaveLength(2);
});

test('queue overflow actions retry, resave, remove, copy filename, and copy command', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const runtimeClient = buildRuntimeClient([buildCandidate()]);
  globalThis.localStorage.setItem('unshackle:sidepanel:activeTab', 'downloads');
  useSettingsStore.setState({ customCommandTemplate: 'yt-dlp "{url}" -o "{filename}"' });
  usePanelStore.setState({
    mediaItems: [],
    queueJobs: [
      {
        id: 'job-1',
        candidateId: 'candidate-1',
        tabId: 7,
        phase: 'completed',
        createdAt: 1,
        updatedAt: 1,
        selection: { mode: 'custom' },
        progressPct: 100,
        bytesDownloaded: 0,
        output: {
          fileName: 'queued.mp4',
          mimeType: 'video/mp4',
          outputUrl: 'https://cdn.example.com/queued.mp4',
        },
      },
    ],
  });

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  await user.click(screen.getByRole('tab', { name: /completed 1/i }));
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /copy filename/i }));
  expect(writeText).toHaveBeenCalledWith('queued.mp4');

  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /copy yt-dlp command/i }));
  expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('yt-dlp'));

  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /save again/i }));
  expect(runtimeClient.resaveDownload).toHaveBeenCalledWith('job-1');

  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /remove from queue/i }));
  expect(runtimeClient.removeDownload).toHaveBeenCalledWith('job-1');
});

test('advanced integrations menu dispatches to configured webhook', async () => {
  const user = userEvent.setup();
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 200 }));
  vi.stubGlobal('fetch', fetchImpl);
  useSettingsStore.setState({
    advancedMode: true,
    aria2Enabled: false,
    webhookEnabled: true,
    webhookUrl: 'https://hook.example/notify',
  });
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'integration-direct',
      displayName: 'Integration direct stream',
      sourceUrl: 'https://cdn.example.com/integration.mp4',
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Integration direct stream')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /send to integrations/i }));

  expect(fetchImpl).toHaveBeenCalledWith(
    'https://hook.example/notify',
    expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('https://cdn.example.com/integration.mp4'),
    }),
  );
});

test('current media copy URL action falls back when navigator clipboard is unavailable', async () => {
  const user = userEvent.setup();
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: () => true,
  });
  const execCommand = vi.spyOn(document, 'execCommand').mockReturnValue(true);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
  const runtimeClient = buildRuntimeClient([buildCandidate()]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Clear runtime video')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /copy video url/i }));

  expect(execCommand).toHaveBeenCalledWith('copy');
});

test('preview eye requests a direct browser preview asset before opening', async () => {
  const user = userEvent.setup();
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'direct-preview',
      protocol: 'direct',
      displayName: 'Direct preview stream',
      sourceUrl: 'https://cdn.example.com/video.webm',
      mimeType: 'video/webm',
      fileExtensionHint: 'webm',
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Direct preview stream')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /preview/i }));

  expect(runtimeClient.getPreviewAsset).toHaveBeenCalledWith('direct-preview', {
    format: 'webm',
  });
  expect(await screen.findByRole('dialog', { name: /preview direct preview stream/i }))
    .toBeInTheDocument();
});
