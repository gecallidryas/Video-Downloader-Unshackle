import { usePanelStore } from '@/src/state/usePanelStore';
import type { DetectedMedia } from '@/src/types/media';

beforeEach(() => {
  usePanelStore.setState({
    surfaceState: 'detecting',
    mediaItems: [],
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
