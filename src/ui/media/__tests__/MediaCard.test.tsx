import { render, screen } from '@testing-library/react';
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

test('renders preview, remove, and download action buttons', () => {
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
  expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
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
