import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { PreviewModal } from '@/src/ui/preview/PreviewModal';

test('direct trim controls require native for original trim until browser WebM recording is selected', async () => {
  const user = userEvent.setup();
  const onDownload = vi.fn();

  render(
    <PreviewModal
      open
      title="Direct file"
      sourceUrl="https://cdn.example.com/video.mp4"
      protocol="direct"
      browserRecordingAvailable
      onClose={() => {}}
      onDownload={onDownload}
    />,
  );

  const video = screen.getByLabelText(/preview video/i) as HTMLVideoElement;
  Object.defineProperty(video, 'duration', { value: 60, configurable: true });
  video.dispatchEvent(new Event('loadedmetadata'));

  expect(
    screen.getByText(/native required for original trim/i),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText(/trim (range|controls)/i)).not.toBeInTheDocument();

  await user.click(screen.getByRole('radio', { name: /browser webm clip/i }));

  expect(screen.getByLabelText(/trim (range|controls)/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /download selection/i }));
  expect(onDownload).toHaveBeenCalledWith(null, { outputKind: 'webm' });
});
