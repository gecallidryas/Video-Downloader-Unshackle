import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { SidePanelApp } from '../SidePanelApp';
import { usePanelStore } from '@/src/state/usePanelStore';
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
    getQueueStats: vi.fn().mockResolvedValue({
      queued: 0,
      running: 0,
      failed: 0,
      completed: 0,
    }),
  };
}

beforeEach(() => {
  usePanelStore.setState({
    surfaceState: 'detecting',
    candidates: [],
    mediaItems: [],
    errorMessage: null,
    downloadingIds: new Set<string>(),
  });
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
