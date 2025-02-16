import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { PreviewModal } from '../PreviewModal';

test('renders direct preview with disabled trim messaging', () => {
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
  expect(screen.getByText(/trim is not supported for direct/i)).toBeInTheDocument();
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
  expect(screen.getByLabelText(/trim start/i)).toBeEnabled();
});

test('closes on escape and reports trim selection for streamed media', async () => {
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

  await user.type(screen.getByLabelText(/trim start/i), '0:10');
  await user.type(screen.getByLabelText(/trim end/i), '0:20');
  await user.click(screen.getByRole('button', { name: /download selection/i }));
  expect(onDownload).toHaveBeenCalledWith({ startSec: 10, endSec: 20 });

  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalled();
});
