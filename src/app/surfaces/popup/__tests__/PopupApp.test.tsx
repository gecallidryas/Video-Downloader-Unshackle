import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PopupApp } from '../PopupApp';
import { useSettingsStore } from '@/src/state/useSettingsStore';

beforeEach(() => {
  useSettingsStore.setState({
    autoDetectEnabled: true,
    downloadPath: 'Downloads',
    notificationsEnabled: true,
    preferredQuality: 'best',
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
