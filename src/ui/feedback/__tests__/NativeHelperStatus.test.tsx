import { render, screen } from '@testing-library/react';
import { NativeHelperStatus } from '../NativeHelperStatus';

test('shows helper connected status', () => {
  render(<NativeHelperStatus status="connected" />);
  expect(screen.getByText(/native ffmpeg helper/i)).toBeInTheDocument();
  expect(screen.getByText(/connected/i)).toBeInTheDocument();
});

test('shows helper missing status', () => {
  render(<NativeHelperStatus status="missing" />);
  expect(screen.getByText(/not installed/i)).toBeInTheDocument();
});

test('shows ffmpeg missing status', () => {
  render(<NativeHelperStatus status="ffmpeg-missing" />);
  expect(screen.getByText(/ffmpeg not found/i)).toBeInTheDocument();
});

test('shows setup documentation link when provided', () => {
  render(<NativeHelperStatus status="missing" setupHref="docs/native-helper.md" />);

  expect(screen.getByRole('link', { name: /setup/i })).toHaveAttribute(
    'href',
    'docs/native-helper.md',
  );
});
