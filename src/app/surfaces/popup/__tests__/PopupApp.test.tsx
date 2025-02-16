import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PopupApp } from '../PopupApp';
import { useSettingsStore } from '@/src/state/useSettingsStore';

beforeEach(() => {
  useSettingsStore.setState({
    theme: 'contrast',
    autoDetectEnabled: true,
    autoScanEnabled: true,
    networkCaptureEnabled: true,
    downloadPath: 'Downloads',
    notificationsEnabled: true,
    showNotifications: true,
    preferredQuality: 'best',
    maxConcurrentDownloads: 3,
    maxConcurrentSegments: 5,
    preferredAudioLanguage: 'en',
    namingTemplate: '{title}_{quality}_{date}_{time}',
    previewMode: 'image',
    previewFormat: 'webm',
  });
});

test('renders the popup header', () => {
  render(<PopupApp />);
  expect(screen.getByText(/settings/i)).toBeInTheDocument();
});

test('renders auto-detect toggle enabled by default', () => {
  render(<PopupApp />);
  const toggle = screen.getByRole('checkbox', { name: /auto-detect/i });
  expect(toggle).toBeChecked();
});

test('toggling auto-detect updates the store', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);
  const toggle = screen.getByRole('checkbox', { name: /auto-detect/i });
  await user.click(toggle);
  expect(useSettingsStore.getState().autoDetectEnabled).toBe(false);
});

test('renders notifications toggle', () => {
  render(<PopupApp />);
  const toggle = screen.getByRole('checkbox', { name: /notifications/i });
  expect(toggle).toBeChecked();
});

test('renders preferred quality selector', () => {
  render(<PopupApp />);
  expect(screen.getByRole('combobox', { name: /preferred quality/i })).toBeInTheDocument();
});

test('renders extension version info', () => {
  render(<PopupApp />);
  expect(screen.getByText(/v0\.1\.0/)).toBeInTheDocument();
});

test('renders source-equivalent theme and download settings in the flat settings surface', () => {
  render(<PopupApp />);

  expect(screen.getByRole('combobox', { name: /theme/i })).toHaveValue('contrast');
  expect(screen.getByRole('option', { name: /blueberry/i })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /network capture/i })).toBeChecked();
  expect(screen.getByRole('combobox', { name: /max concurrent downloads/i })).toHaveValue('3');
  expect(screen.getByRole('combobox', { name: /segments per download/i })).toHaveValue('5');
  expect(screen.getByRole('combobox', { name: /preferred audio language/i })).toHaveValue('en');
  expect(screen.getByRole('textbox', { name: /filename template/i })).toHaveValue(
    '{title}_{quality}_{date}_{time}',
  );
  expect(screen.getByRole('combobox', { name: /preview mode/i })).toHaveValue('image');
  expect(screen.getByRole('combobox', { name: /preview format/i })).toHaveValue('webm');
  expect(screen.getByText(/native ffmpeg helper/i)).toBeInTheDocument();
});

test('preview format selection persists to the settings store', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.selectOptions(screen.getByRole('combobox', { name: /preview format/i }), 'gif');

  expect(useSettingsStore.getState().previewFormat).toBe('gif');
});

test('theme selection persists to the settings store and document token hook', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.selectOptions(screen.getByRole('combobox', { name: /theme/i }), 'ocean');

  expect(useSettingsStore.getState().theme).toBe('ocean');
  expect(document.documentElement).toHaveAttribute('data-theme', 'ocean');
});
