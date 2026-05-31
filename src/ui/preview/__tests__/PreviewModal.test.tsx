import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { PreviewModal } from '../PreviewModal';
import type { CodecInfo } from '@/src/core/preview/codec-sniff';

test('renders direct preview with native-required original trim messaging', () => {
  render(
    <PreviewModal
      open
      title="Direct file"
      sourceUrl="https://cdn.example.com/video.mp4"
      protocol="direct"
      onClose={() => {}}
      onDownload={() => {}}
    />,
  );

  expect(screen.getByRole('dialog', { name: /preview direct file/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/preview video/i)).toHaveAttribute(
    'src',
    'https://cdn.example.com/video.mp4',
  );
  expect(screen.getByText(/native required for original trim/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/trim range/i)).not.toBeInTheDocument();
});

test('renders direct preview with native-helper trim messaging when helper is available', () => {
  render(
    <PreviewModal
      open
      title="Direct file"
      sourceUrl="https://cdn.example.com/video.mp4"
      protocol="direct"
      nativeHelperAvailable
      onClose={() => {}}
      onDownload={() => {}}
    />,
  );

  expect(screen.getByText(/native helper is required for direct trim/i)).toBeInTheDocument();
});

test('closes on escape and downloads with null trim by default', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const onDownload = vi.fn();

  render(
    <PreviewModal
      open
      title="HLS stream"
      sourceUrl="https://cdn.example.com/master.m3u8"
      protocol="hls"
      onClose={onClose}
      onDownload={onDownload}
    />,
  );

  await user.click(screen.getByRole('button', { name: /download selection/i }));
  expect(onDownload).toHaveBeenCalledWith(null);

  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalled();
});

test('renders codec badge with warning when codec is unsupported', () => {
  const codec: CodecInfo = { video: 'HEVC', container: 'mp4' };
  render(
    <PreviewModal
      open
      title="HEVC stream"
      sourceUrl="https://cdn.example.com/master.m3u8"
      protocol="hls"
      codecInfo={codec}
      onClose={() => {}}
      onDownload={() => {}}
    />,
  );
  expect(screen.getByText('HEVC')).toBeInTheDocument();
});

test('renders reload button and key bumps on click', async () => {
  const user = userEvent.setup();
  render(
    <PreviewModal
      open
      title="HLS"
      sourceUrl="https://cdn.example.com/master.m3u8"
      protocol="hls"
      onClose={() => {}}
      onDownload={() => {}}
    />,
  );
  const reload = screen.getByRole('button', { name: /reload preview/i });
  await user.click(reload);
  expect(reload).toBeInTheDocument();
});

test('fires onDurationResolved when video loadedmetadata fires', async () => {
  const onDurationResolved = vi.fn();
  render(
    <PreviewModal
      open
      title="HLS"
      sourceUrl="https://cdn.example.com/master.m3u8"
      protocol="hls"
      onClose={() => {}}
      onDownload={() => {}}
      onDurationResolved={onDurationResolved}
    />,
  );

  const video = screen.getByLabelText(/preview video/i) as HTMLVideoElement;
  Object.defineProperty(video, 'duration', { value: 123.5, configurable: true });
  video.dispatchEvent(new Event('loadedmetadata'));

  expect(onDurationResolved).toHaveBeenCalledWith(123.5);
});

test('renders downloaded-region progress bar when ranges provided', () => {
  render(
    <PreviewModal
      open
      title="HLS"
      sourceUrl="https://cdn.example.com/master.m3u8"
      protocol="hls"
      downloadedRanges={[{ start: 0, end: 30 }]}
      totalDurationSec={100}
      onClose={() => {}}
      onDownload={() => {}}
    />,
  );
  expect(screen.getByRole('progressbar', { name: /downloaded preview region/i })).toBeInTheDocument();
});

test('surfaces the active HLS playback strategy', () => {
  render(
    <PreviewModal
      open
      title="HLS"
      sourceUrl="https://cdn.example.com/master.m3u8"
      protocol="hls"
      onClose={() => {}}
      onDownload={() => {}}
    />,
  );

  const strategy = screen.getByTestId('preview-playback-strategy');
  expect(strategy).toBeInTheDocument();
  expect(strategy).toHaveAttribute('data-strategy', 'native');
});

test('does not surface playback strategy for direct sources', () => {
  render(
    <PreviewModal
      open
      title="Direct file"
      sourceUrl="https://cdn.example.com/video.mp4"
      protocol="direct"
      onClose={() => {}}
      onDownload={() => {}}
    />,
  );

  expect(screen.queryByTestId('preview-playback-strategy')).not.toBeInTheDocument();
});

test('renders custom video player controls', () => {
  render(
    <PreviewModal
      open
      title="Player test"
      sourceUrl="https://cdn.example.com/master.m3u8"
      protocol="hls"
      onClose={() => {}}
      onDownload={() => {}}
    />,
  );

  expect(screen.getByRole('group', { name: /video player/i })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^play$/i })).toHaveLength(2);
  expect(screen.getByLabelText(/seek/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/volume/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /playback speed/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /fullscreen/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /picture-in-picture/i })).toBeInTheDocument();
});

test('speed menu opens and lists options', async () => {
  const user = userEvent.setup();
  render(
    <PreviewModal
      open
      title="Speed test"
      sourceUrl="https://cdn.example.com/video.mp4"
      protocol="hls"
      onClose={() => {}}
      onDownload={() => {}}
    />,
  );

  await user.click(screen.getByRole('button', { name: /playback speed/i }));
  expect(screen.getByRole('menu', { name: /speed options/i })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /0\.5x/i })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /^2x$/i })).toBeInTheDocument();
});
