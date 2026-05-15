import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SidePanelApp } from '../SidePanelApp';
import { usePanelStore } from '@/src/state/usePanelStore';
import { useSettingsStore } from '@/src/state/useSettingsStore';
import type { RuntimeClient } from '@/src/lib/runtime/client';
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
    variants: [
      {
        id: '720p',
        height: 720,
        isDefault: true,
      },
    ],
    audioTracks: [],
    subtitleTracks: [],
    evidence: [
      {
        source: 'network',
        confidence: 0.75,
        url: 'https://cdn.example.com/video.mp4',
        createdAt: 100,
      },
    ],
    preview: { playable: true, adapter: 'native' },
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function buildRuntimeClient(candidates: MediaCandidate[]): RuntimeClient {
  return {
    getCandidates: vi.fn().mockResolvedValue(candidates),
    ingestManualHls: vi.fn().mockResolvedValue([
      buildCandidate({
        id: 'manual-hls',
        protocol: 'hls',
        status: 'partial',
        displayName: 'manual.m3u8',
        sourceUrl: undefined,
        manifestUrl: 'https://cdn.example.com/manual.m3u8',
      }),
    ]),
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
    getMediaAssetState: vi.fn().mockResolvedValue([]),
    queueMediaAsset: vi.fn().mockImplementation((candidateId: string, kind: 'poster' | 'hoverClip') =>
      Promise.resolve({
        candidateId,
        kind,
        status: 'ready',
        assetUrl: kind === 'poster' ? 'thumb.jpg' : 'preview.webm',
        mimeType: kind === 'poster' ? 'image/jpeg' : 'video/webm',
        updatedAt: 1,
      }),
    ),
    cancelDownload: vi.fn().mockResolvedValue({ cancelled: true }),
    retrySegment: vi.fn().mockResolvedValue(undefined),
    retryFailedSegments: vi.fn().mockResolvedValue(undefined),
    exportPartialHls: vi.fn().mockResolvedValue(undefined),
    updateHlsSegmentRange: vi.fn().mockResolvedValue(undefined),
    recoverHlsExport: vi.fn().mockResolvedValue(undefined),
    replaceHlsManifestUrl: vi.fn().mockResolvedValue(undefined),
    getAllCandidates: vi.fn().mockResolvedValue(candidates),
    getJobs: vi.fn().mockResolvedValue([]),
    subscribeToUpdates: vi.fn(() => ({ close: vi.fn() })),
    retryDownload: vi.fn().mockResolvedValue(undefined),
    resaveDownload: vi.fn().mockResolvedValue(undefined),
    removeDownload: vi.fn().mockResolvedValue(true),
    clearCompletedDownloads: vi.fn().mockResolvedValue([]),
    pauseAllDownloads: vi.fn().mockResolvedValue([]),
    ingestDirectUrl: vi.fn().mockResolvedValue(undefined),
    ingestPageUrl: vi.fn().mockResolvedValue(undefined),
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
    grantDownloadConsent: vi.fn().mockResolvedValue(['protected']),
  };
}

beforeEach(() => {
  globalThis.localStorage?.removeItem('unshackle:sidepanel:activeTab');
  usePanelStore.setState({
    surfaceState: 'detecting',
    candidates: [],
    mediaItems: [],
    queueJobs: [],
    errorMessage: null,
    downloadingIds: new Set<string>(),
  });
  useSettingsStore.setState({ advancedMode: false });
});

afterEach(() => {
  vi.useRealTimers();
});

test('loads side panel candidates from a typed runtime client', async () => {
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'clear-1',
      displayName: 'Runtime clear candidate',
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  await waitFor(() => {
    expect(runtimeClient.getCandidates).toHaveBeenCalledWith(7);
  });

  expect(await screen.findByText('Runtime clear candidate')).toBeInTheDocument();
  expect(screen.getByText('1 File')).toBeInTheDocument();
});

test('submits manual HLS text ingest from the current tab view', async () => {
  const user = userEvent.setup();
  const runtimeClient = buildRuntimeClient([]);
  useSettingsStore.setState({ advancedMode: true });

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  await user.click(screen.getByRole('button', { name: /manual ingest tools/i }));
  fireEvent.change(screen.getByRole('textbox', { name: /manual hls input/i }), {
    target: { value: 'seg-1.ts\nseg-2.ts' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /base url/i }), {
    target: { value: 'https://cdn.example.com/master.m3u8' },
  });
  await user.click(screen.getByRole('button', { name: /ingest hls/i }));

  expect(runtimeClient.ingestManualHls).toHaveBeenCalledWith({
    tabId: 7,
    pageUrl: '',
    input: 'seg-1.ts\nseg-2.ts',
    baseUrl: 'https://cdn.example.com/master.m3u8',
  });
  expect((await screen.findAllByText('manual.m3u8')).length).toBeGreaterThan(0);
});

test('renders clear candidates with a normal download action', async () => {
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'clear-download',
      displayName: 'Downloadable clear video',
      protection: { kind: 'none' },
      status: 'ready',
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Downloadable clear video')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^download$/i })).toBeEnabled();
});

test('renders protected candidates with warning copy and blocks generic download', async () => {
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'protected-1',
      displayName: 'Protected runtime stream',
      protocol: 'dash',
      status: 'protected',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/protected.mpd',
      protection: {
        kind: 'drm',
        reason: 'Detected DRM marker in evidence.',
        drmSystems: ['widevine'],
      },
      preview: { playable: false, adapter: 'none' },
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Protected runtime stream')).toBeInTheDocument();
  expect(
    screen.getByText(/appears protected or permission-restricted/i),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/proceed only if you have explicit permission/i),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /protected media/i })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /^download$/i })).not.toBeInTheDocument();
});

test('starts HLS browser fallback download with current quality and track selections', async () => {
  const user = userEvent.setup();
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'hls-1',
      displayName: 'Selectable HLS stream',
      protocol: 'hls',
      manifestUrl: 'https://cdn.example.com/master.m3u8',
      fileExtensionHint: undefined,
      variants: [
        { id: 'variant-1080', height: 1080, isDefault: true },
        { id: 'variant-720', height: 720 },
      ],
      audioTracks: [
        { id: 'audio-en', kind: 'audio', label: 'English', language: 'en' },
        { id: 'audio-es', kind: 'audio', label: 'Spanish', language: 'es' },
      ],
      subtitleTracks: [
        { id: 'subs-en', kind: 'subtitle', label: 'English captions', language: 'en' },
      ],
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Selectable HLS stream')).toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: /quality/i }), 'variant-720');
  await user.selectOptions(screen.getByRole('combobox', { name: /audio/i }), 'audio-es');
  await user.selectOptions(screen.getByRole('combobox', { name: /subtitles/i }), 'subs-en');
  await user.click(screen.getByRole('button', { name: /^download$/i }));

  expect(runtimeClient.startDownload).toHaveBeenCalledWith('hls-1', {
    mode: 'custom',
    variantId: 'variant-720',
    audioTrackIds: ['audio-es'],
    subtitleTrackIds: ['subs-en'],
    subtitleOutput: 'embed',
  });

  await user.click(screen.getByRole('button', { name: /downloads/i }));
  expect(screen.getByRole('tab', { name: /active 1/i })).toBeInTheDocument();

  expect(screen.getByText('Selectable HLS stream')).toBeInTheDocument();
});

test('opens preview modal for preview-capable streamed media', async () => {
  const user = userEvent.setup();
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'hls-preview',
      displayName: 'Previewable HLS stream',
      protocol: 'hls',
      sourceUrl: undefined,
      manifestUrl: 'https://cdn.example.com/master.m3u8',
      posterUrl: 'https://cdn.example.com/poster.jpg',
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Previewable HLS stream')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /preview/i }));

  expect(await screen.findByRole('dialog', { name: /preview previewable hls stream/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/preview video/i)).toHaveAttribute(
    'src',
    'https://cdn.example.com/master.m3u8',
  );
});

test('refreshes candidates immediately when CANDIDATES_UPDATED Port push arrives', async () => {
  const candidatesHandlerRefs: Array<{ onCandidatesChanged?(): void }> = [];
  const runtimeClient = buildRuntimeClient([]);
  vi.mocked(runtimeClient.getCandidates)
    .mockResolvedValueOnce([])
    .mockResolvedValue([
      buildCandidate({ id: 'pushed-1', displayName: 'Pushed candidate' }),
    ]);
  vi.mocked(runtimeClient.subscribeToUpdates).mockImplementation((handlers) => {
    candidatesHandlerRefs.push(handlers);
    return { close: vi.fn() };
  });

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  await waitFor(() => {
    expect(runtimeClient.getCandidates).toHaveBeenCalledTimes(1);
  });

  // Find the subscription that has onCandidatesChanged (the candidates interval effect).
  const candidatesHandler = candidatesHandlerRefs.find((h) => typeof h.onCandidatesChanged === 'function');
  expect(candidatesHandler).toBeDefined();

  act(() => {
    candidatesHandler?.onCandidatesChanged?.();
  });

  expect(await screen.findByText('Pushed candidate')).toBeInTheDocument();
  expect(screen.getByText('1 File')).toBeInTheDocument();
});

test('suppresses fallback interval when Port push has arrived recently', async () => {
  vi.useFakeTimers();
  const candidatesHandlerRefs: Array<{ onCandidatesChanged?(): void }> = [];
  const runtimeClient = buildRuntimeClient([]);
  vi.mocked(runtimeClient.getCandidates).mockResolvedValue([]);
  vi.mocked(runtimeClient.subscribeToUpdates).mockImplementation((handlers) => {
    candidatesHandlerRefs.push(handlers);
    return { close: vi.fn() };
  });

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

  // Find the subscription that has onCandidatesChanged (the candidates interval effect).
  const candidatesHandler = candidatesHandlerRefs.find((h) => typeof h.onCandidatesChanged === 'function');
  expect(candidatesHandler).toBeDefined();

  // Simulate a Port push just before the interval fires — should suppress the poll.
  act(() => {
    candidatesHandler?.onCandidatesChanged?.();
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  const callsAfterPush = vi.mocked(runtimeClient.getCandidates).mock.calls.length;

  // Advance less than the interval — fallback should not fire again (recent push).
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(vi.mocked(runtimeClient.getCandidates).mock.calls.length).toBe(callsAfterPush);

  // Advance past the full interval without a push — fallback should now fire.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_500);
  });
  expect(vi.mocked(runtimeClient.getCandidates).mock.calls.length).toBeGreaterThan(callsAfterPush);
});

test('closes candidates Port subscription on unmount', () => {
  const closeSpy = vi.fn();
  const runtimeClient = buildRuntimeClient([]);
  vi.mocked(runtimeClient.subscribeToUpdates).mockReturnValue({ close: closeSpy });

  const { unmount } = render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);
  unmount();

  expect(closeSpy).toHaveBeenCalled();
});

test('preview modal download with no trim sends null', async () => {
  const user = userEvent.setup();
  const runtimeClient = buildRuntimeClient([
    buildCandidate({
      id: 'direct-preview',
      displayName: 'Previewable direct stream',
      sourceUrl: 'https://cdn.example.com/video.mp4',
    }),
  ]);

  render(<SidePanelApp activeTabId={7} runtimeClient={runtimeClient} />);

  expect(await screen.findByText('Previewable direct stream')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /preview/i }));
  await user.click(screen.getByRole('button', { name: /download selection/i }));

  expect(runtimeClient.startDownload).toHaveBeenCalledWith('direct-preview', expect.objectContaining({
    mode: 'custom',
  }));
});
