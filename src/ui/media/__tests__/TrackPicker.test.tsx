import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { TrackPicker } from '../TrackPicker';

const audioTracks = [
  { id: 'audio-en', label: 'English', language: 'en', default: true },
  { id: 'audio-es', label: 'Spanish', language: 'es' },
];

const subtitleTracks = [
  { id: 'subs-en', label: 'English captions', language: 'en' },
];

test('renders audio tracks only when multiple tracks exist', () => {
  const { rerender } = render(
    <TrackPicker
      kind="audio"
      tracks={[audioTracks[0]]}
      selectedIds={['audio-en']}
      onChange={() => {}}
    />,
  );

  expect(screen.queryByRole('combobox', { name: /audio/i })).not.toBeInTheDocument();

  rerender(
    <TrackPicker
      kind="audio"
      tracks={audioTracks}
      selectedIds={['audio-en']}
      onChange={() => {}}
    />,
  );

  expect(screen.getByRole('combobox', { name: /audio/i })).toBeInTheDocument();
});

test('lets users select optional subtitles with a none option', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(
    <TrackPicker
      kind="subtitle"
      tracks={subtitleTracks}
      selectedIds={[]}
      onChange={onChange}
    />,
  );

  await user.selectOptions(
    screen.getByRole('combobox', { name: /subtitles/i }),
    'subs-en',
  );

  expect(screen.getByRole('option', { name: /none/i })).toBeInTheDocument();
  expect(onChange).toHaveBeenCalledWith(['subs-en']);
});
