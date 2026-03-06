import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, vi } from 'vitest';
import { VideoPlayer, formatTime } from '../VideoPlayer';

function noopRef() {}

afterEach(() => {
  vi.restoreAllMocks();
});

test('renders video element and play overlay when paused', () => {
  render(
    <VideoPlayer videoRef={noopRef} sourceUrl="https://example.com/video.mp4" playerKey={0} />,
  );

  expect(screen.getByLabelText(/preview video/i)).toHaveAttribute('src', 'https://example.com/video.mp4');
  expect(screen.getAllByRole('button', { name: /^play$/i })).toHaveLength(2);
});

test('renders all control buttons', () => {
  render(
    <VideoPlayer videoRef={noopRef} sourceUrl="test.mp4" playerKey={0} />,
  );

  expect(screen.getByLabelText(/seek/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/volume/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /mute/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /playback speed/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /picture-in-picture/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /fullscreen/i })).toBeInTheDocument();
});

test('speed menu toggles on click', async () => {
  const user = userEvent.setup();
  render(
    <VideoPlayer videoRef={noopRef} sourceUrl="test.mp4" playerKey={0} />,
  );

  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /playback speed/i }));
  expect(screen.getByRole('menu', { name: /speed options/i })).toBeInTheDocument();
  expect(screen.getAllByRole('menuitem')).toHaveLength(7);
});

test('passes ref to external callback', () => {
  const ref = vi.fn();
  render(
    <VideoPlayer videoRef={ref} sourceUrl="test.mp4" playerKey={0} />,
  );

  expect(ref).toHaveBeenCalledWith(expect.any(HTMLVideoElement));
});

test('formatTime handles various inputs', () => {
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(65)).toBe('1:05');
  expect(formatTime(3661)).toBe('1:01:01');
  expect(formatTime(NaN)).toBe('0:00');
  expect(formatTime(-5)).toBe('0:00');
});

test('displays time with testid', () => {
  render(
    <VideoPlayer videoRef={noopRef} sourceUrl="test.mp4" playerKey={0} />,
  );

  expect(screen.getByTestId('player-time')).toHaveTextContent('0:00 / 0:00');
});

test('double click seeks backward on the left half and forward on the right half', () => {
  render(
    <VideoPlayer videoRef={noopRef} sourceUrl="test.mp4" playerKey={0} />,
  );

  const video = screen.getByLabelText(/preview video/i) as HTMLVideoElement;
  Object.defineProperty(video, 'duration', { value: 120, configurable: true });
  Object.defineProperty(video, 'currentTime', { value: 50, writable: true });
  vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    top: 0,
    right: 200,
    bottom: 100,
    left: 0,
    toJSON: () => ({}),
  });

  fireEvent.doubleClick(video, { clientX: 25 });
  expect(video.currentTime).toBe(40);

  fireEvent.doubleClick(video, { clientX: 175 });
  expect(video.currentTime).toBe(50);
});

test('opens the preview source in a new tab when native fullscreen is rejected', async () => {
  const user = userEvent.setup();
  const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  render(
    <VideoPlayer videoRef={noopRef} sourceUrl="https://cdn.example.com/test.mp4" playerKey={0} />,
  );

  const player = screen.getByRole('group', { name: /video player/i });
  Object.defineProperty(player, 'requestFullscreen', {
    configurable: true,
    value: vi.fn().mockRejectedValue(new Error('Denied by side panel')),
  });

  await user.click(screen.getByRole('button', { name: /fullscreen/i }));

  expect(openSpy).toHaveBeenCalledWith(
    'https://cdn.example.com/test.mp4',
    '_blank',
    'noopener,noreferrer',
  );
  expect(player).not.toHaveClass('vp--fallback-fullscreen');
  expect(screen.getByRole('button', { name: /fullscreen/i })).toBeInTheDocument();
});

test('does not open a new tab when native fullscreen succeeds', async () => {
  const user = userEvent.setup();
  const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  render(
    <VideoPlayer videoRef={noopRef} sourceUrl="https://cdn.example.com/test.mp4" playerKey={0} />,
  );

  const player = screen.getByRole('group', { name: /video player/i });
  Object.defineProperty(player, 'requestFullscreen', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });

  await user.click(screen.getByRole('button', { name: /fullscreen/i }));

  expect(openSpy).not.toHaveBeenCalled();
});
