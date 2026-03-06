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

test('defaults to detecting state with no runtime media', () => {
  const { surfaceState, mediaItems } = usePanelStore.getState();
  expect(surfaceState).toBe('detecting');
  expect(mediaItems).toHaveLength(0);
});

test('removeItem removes a media item by id', () => {
  const mediaItems: DetectedMedia[] = [
    {
      id: 'media-1',
      title: 'Runtime Candidate One',
      format: 'MP4',
      size: '24 MB',
      duration: '01:15',
      mediaType: 'video',
      qualities: [{ label: '1080p', value: '1080p' }],
      selectedQuality: '1080p',
    },
    {
      id: 'media-2',
      title: 'Runtime Candidate Two',
      format: 'HLS',
      size: '58 MB',
      duration: '04:10',
      mediaType: 'video',
      qualities: [{ label: '720p', value: '720p' }],
      selectedQuality: '720p',
    },
  ];

  usePanelStore.setState({ surfaceState: 'results', mediaItems });
  usePanelStore.getState().removeItem('media-2');
  const { mediaItems: nextMediaItems } = usePanelStore.getState();
  expect(nextMediaItems).toHaveLength(1);
  expect(nextMediaItems.find((m) => m.id === 'media-2')).toBeUndefined();
});

test('setQuality updates the selected quality for an item', () => {
  usePanelStore.setState({
    surfaceState: 'results',
    mediaItems: [
      {
        id: 'media-1',
        title: 'Runtime Candidate One',
        format: 'MP4',
        size: '24 MB',
        duration: '01:15',
        mediaType: 'video',
        qualities: [
          { label: '1080p', value: '1080p' },
          { label: '720p', value: '720p' },
        ],
        selectedQuality: '1080p',
      },
    ],
  });
  usePanelStore.getState().setQuality('media-1', '720p');
  const item = usePanelStore.getState().mediaItems.find((m) => m.id === 'media-1');
  expect(item?.selectedQuality).toBe('720p');
});

test('downloadItem adds item id to downloading set', () => {
  usePanelStore.setState({
    surfaceState: 'results',
    mediaItems: [
      {
        id: 'media-1',
        title: 'Runtime Candidate One',
        format: 'MP4',
        size: '24 MB',
        duration: '01:15',
        mediaType: 'video',
        qualities: [{ label: '1080p', value: '1080p' }],
        selectedQuality: '1080p',
      },
    ],
  });
  usePanelStore.getState().downloadItem('media-1');
  expect(usePanelStore.getState().downloadingIds.has('media-1')).toBe(true);
});

test('upsertQueueJob stores the latest queue job status', () => {
  usePanelStore.getState().upsertQueueJob({
    id: 'job-1',
    candidateId: 'media-1',
    tabId: 7,
    phase: 'queued',
    createdAt: 1,
    updatedAt: 1,
    selection: { mode: 'custom' },
    progressPct: 0,
    bytesDownloaded: 0,
  });
  usePanelStore.getState().upsertQueueJob({
    id: 'job-1',
    candidateId: 'media-1',
    tabId: 7,
    phase: 'fetching',
    createdAt: 1,
    updatedAt: 2,
    selection: { mode: 'custom' },
    progressPct: 42,
    bytesDownloaded: 100,
  });

  expect(usePanelStore.getState().queueJobs).toEqual([
    expect.objectContaining({ id: 'job-1', phase: 'fetching', progressPct: 42 }),
  ]);
});

test('removeItem removes queue jobs for that media item', () => {
  usePanelStore.setState({
    surfaceState: 'results',
    mediaItems: [
      {
        id: 'media-1',
        title: 'Runtime Candidate One',
        format: 'MP4',
        size: '24 MB',
        duration: '01:15',
        mediaType: 'video',
        qualities: [{ label: '1080p', value: '1080p' }],
        selectedQuality: '1080p',
      },
    ],
    queueJobs: [
      {
        id: 'job-1',
        candidateId: 'media-1',
        tabId: 7,
        phase: 'queued',
        createdAt: 1,
        updatedAt: 1,
        selection: { mode: 'custom' },
        progressPct: 0,
        bytesDownloaded: 0,
      },
    ],
  });

  usePanelStore.getState().removeItem('media-1');
  expect(usePanelStore.getState().queueJobs).toHaveLength(0);
});

test('builds a custom download selection from media controls', () => {
  usePanelStore.setState({
    surfaceState: 'results',
    mediaItems: [
      {
        id: 'media-1',
        title: 'Runtime Candidate One',
        format: 'HLS',
        size: '24 MB',
        duration: '01:15',
        mediaType: 'video',
        protocol: 'hls',
        qualities: [
          { label: '1080p', value: 'variant-1080' },
          { label: '720p', value: 'variant-720' },
        ],
        selectedQuality: 'variant-1080',
        audioTracks: [{ id: 'audio-en', label: 'English' }],
        selectedAudioTrackIds: ['audio-en'],
        subtitleTracks: [{ id: 'subs-en', label: 'English captions' }],
        selectedSubtitleTrackIds: [],
      },
    ],
  });

  usePanelStore.getState().setQuality('media-1', 'variant-720');
  usePanelStore.getState().setAudioTracks('media-1', ['audio-en']);
  usePanelStore.getState().setSubtitleTracks('media-1', ['subs-en']);
  usePanelStore.getState().setSubtitleOutput('media-1', 'sidecar');
  usePanelStore.getState().setTrim('media-1', { startSec: 10, endSec: 20 });

  expect(usePanelStore.getState().getDownloadSelection('media-1')).toEqual({
    mode: 'custom',
    variantId: 'variant-720',
    audioTrackIds: ['audio-en'],
    subtitleTrackIds: ['subs-en'],
    subtitleOutput: 'sidecar',
    trim: { startSec: 10, endSec: 20 },
  });
});
