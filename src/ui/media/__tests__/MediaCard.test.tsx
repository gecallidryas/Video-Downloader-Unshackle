import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MediaCard } from '../MediaCard';
import type { DetectedMedia } from '@/src/types/media';

const mockVideo: DetectedMedia = {
  id: 'test-1',
  title: 'Ocean Sunset Timelapse - 4K Nature',
  format: 'MP4',
  size: '342 MB',
  duration: '12:45',
  mediaType: 'video',
  qualities: [
    { label: '1080p', value: '1080p' },
    { label: '720p', value: '720p' },
  ],
  selectedQuality: '1080p',
};

const mockAudio: DetectedMedia = {
  id: 'test-2',
  title: 'Tech Podcast Episode 42',
  format: 'MP3',
  size: '64 MB',
  duration: '45:00',
  mediaType: 'audio',
  qualities: [{ label: '320kbps', value: '320kbps' }],
  selectedQuality: '320kbps',
};

const noop = () => {};

test('renders video card with title, format chip, size, and duration', () => {
  render(
    <MediaCard
      media={mockVideo}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
    />,
  );
  expect(screen.getByText('Ocean Sunset Timelapse - 4K Nature')).toBeInTheDocument();
  expect(screen.getByText('MP4')).toBeInTheDocument();
  expect(screen.getByText('342 MB')).toBeInTheDocument();
  expect(screen.getByText('12:45')).toBeInTheDocument();
});

test('renders audio card with audio icon indicator', () => {
  render(
    <MediaCard
      media={mockAudio}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
    />,
  );
  expect(screen.getByText('Tech Podcast Episode 42')).toBeInTheDocument();
  expect(screen.getByText('MP3')).toBeInTheDocument();
  expect(screen.getByTestId('audio-icon')).toBeInTheDocument();
});

test('renders quality selector with options', () => {
  render(
    <MediaCard
      media={mockVideo}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
    />,
  );
  const select = screen.getByRole('combobox');
  expect(select).toBeInTheDocument();
  expect(screen.getAllByText('1080p')).toHaveLength(2);
  expect(screen.getByText('720p')).toBeInTheDocument();
});

test('disables quality selector when only one quality option', () => {
  render(
    <MediaCard
      media={mockAudio}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
    />,
  );
  const select = screen.getByRole('combobox');
  expect(select).toBeDisabled();
});

test('renders preview, overflow menu trigger, and download action buttons', () => {
  render(
    <MediaCard
      media={mockVideo}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
    />,
  );
  expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /more actions/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
});

test('overflow menu Remove action calls onRemove', async () => {
  const user = userEvent.setup();
  const onRemove = vi.fn();
  render(
    <MediaCard
      media={mockVideo}
      onPreview={noop}
      onRemove={onRemove}
      onDownload={noop}
      onQualityChange={noop}
    />,
  );

  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /^remove$/i }));

  expect(onRemove).toHaveBeenCalledTimes(1);
});

test('overflow menu Copy video URL action fires onCopyUrl with media.url', async () => {
  const user = userEvent.setup();
  const onCopyUrl = vi.fn();
  render(
    <MediaCard
      media={{ ...mockVideo, url: 'https://example.com/video.m3u8' }}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
      onCopyUrl={onCopyUrl}
    />,
  );

  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /copy video url/i }));

  expect(onCopyUrl).toHaveBeenCalledWith('https://example.com/video.m3u8');
});

test('overflow menu shows Copy audio URL only when audioTracks have a URL', async () => {
  const user = userEvent.setup();
  render(
    <MediaCard
      media={{
        ...mockVideo,
        audioTracks: [
          { id: 'a1', label: 'English', url: 'https://example.com/audio.m4a' },
        ],
      }}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
    />,
  );

  await user.click(screen.getByRole('button', { name: /more actions/i }));
  expect(screen.getByRole('menuitem', { name: /copy audio url/i })).toBeInTheDocument();
});

test('overflow menu hides Copy audio URL when no audio track has a URL', async () => {
  const user = userEvent.setup();
  render(
    <MediaCard
      media={{
        ...mockVideo,
        audioTracks: [{ id: 'a1', label: 'English' }],
      }}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
    />,
  );

  await user.click(screen.getByRole('button', { name: /more actions/i }));
  expect(screen.queryByRole('menuitem', { name: /copy audio url/i })).not.toBeInTheDocument();
});

test('overflow menu Copy filename calls onCopyFilename', async () => {
  const user = userEvent.setup();
  const onCopyFilename = vi.fn();
  render(
    <MediaCard
      media={mockVideo}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
      onCopyFilename={onCopyFilename}
    />,
  );

  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /copy filename/i }));
  expect(onCopyFilename).toHaveBeenCalledTimes(1);
});

test('renders FPS, channels, default, and autoselect chips when data is present', () => {
  render(
    <MediaCard
      media={{
        ...mockVideo,
        fps: 60,
        channels: '5.1',
        default: true,
        autoselect: true,
      }}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
    />,
  );

  expect(screen.getByText('60fps')).toBeInTheDocument();
  expect(screen.getByText('5.1ch')).toBeInTheDocument();
  expect(screen.getByText(/^default$/i)).toBeInTheDocument();
  expect(screen.getByText(/^autoselect$/i)).toBeInTheDocument();
});

test('renders estimated size when bitrate and durationSec are present', () => {
  render(
    <MediaCard
      media={{
        ...mockVideo,
        size: '',
        bitrate: 5_000_000,
        durationSec: 600,
      }}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
    />,
  );

  expect(screen.getByText(/^~/)).toBeInTheDocument();
});

test('shows storage warning when estimated size exceeds remainingStorageBytes', () => {
  render(
    <MediaCard
      media={{
        ...mockVideo,
        bitrate: 8_000_000,
        durationSec: 3600,
      }}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
      remainingStorageBytes={100_000_000}
    />,
  );

  expect(screen.getByTestId('media-storage-warning')).toBeInTheDocument();
});

test('shows custom filename hover card after delay', () => {
  vi.useFakeTimers();
  try {
    render(
      <MediaCard
        media={mockVideo}
        onPreview={noop}
        onRemove={noop}
        onDownload={noop}
        onQualityChange={noop}
      />,
    );

    const title = screen.getByText('Ocean Sunset Timelapse - 4K Nature');
    fireEvent.mouseEnter(title);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(screen.getByTestId('media-filename-tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(title);
    expect(screen.queryByTestId('media-filename-tooltip')).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test('overflow menu Copy all URLs calls onCopyAllUrls', async () => {
  const user = userEvent.setup();
  const onCopyAllUrls = vi.fn();
  render(
    <MediaCard
      media={mockVideo}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
      onCopyAllUrls={onCopyAllUrls}
    />,
  );

  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(screen.getByRole('menuitem', { name: /copy all urls/i }));
  expect(onCopyAllUrls).toHaveBeenCalledTimes(1);
});

test('renders thumbnail, protocol, quality, and protection badges without changing the flat card role', () => {
  render(
    <MediaCard
      media={{
        ...mockVideo,
        thumbnailUrl: 'https://cdn.example.com/poster.jpg',
        format: 'HLS',
        protocol: 'hls',
        status: 'protected',
        protection: {
          kind: 'drm',
          reason: 'Widevine protected stream',
          drmSystems: ['widevine'],
        },
      }}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
    />,
  );

  expect(screen.getByRole('img', { name: /ocean sunset/i })).toHaveAttribute(
    'src',
    'https://cdn.example.com/poster.jpg',
  );
  expect(screen.getByText('HLS')).toBeInTheDocument();
  expect(screen.getAllByText('1080p')).toHaveLength(2);
  expect(screen.getByText('Protected')).toBeInTheDocument();
});

test('requests a hover preview once and restores the static thumbnail on mouse leave', async () => {
  const user = userEvent.setup();
  const onPreviewHover = vi.fn();

  render(
    <MediaCard
      media={{
        ...mockVideo,
        thumbnailUrl: 'https://cdn.example.com/poster.jpg',
        previewAssetUrl: 'blob:preview-webm',
      }}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
      onPreviewHover={onPreviewHover}
    />,
  );

  const thumb = screen.getByTestId('media-thumb');
  expect(screen.getByRole('img', { name: /ocean sunset/i })).toBeInTheDocument();

  await user.hover(thumb);
  await user.hover(thumb);
  expect(onPreviewHover).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText(/hover preview/i)).toHaveAttribute('src', 'blob:preview-webm');

  await user.unhover(thumb);
  expect(screen.getByRole('img', { name: /ocean sunset/i })).toBeInTheDocument();
});

test('keeps preview loading state inside the fixed thumbnail slot', async () => {
  const user = userEvent.setup();

  render(
    <MediaCard
      media={{
        ...mockVideo,
        thumbnailUrl: 'https://cdn.example.com/poster.jpg',
        previewLoading: true,
      }}
      onPreview={noop}
      onRemove={noop}
      onDownload={noop}
      onQualityChange={noop}
      onPreviewHover={noop}
    />,
  );

  await user.hover(screen.getByTestId('media-thumb'));
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});
