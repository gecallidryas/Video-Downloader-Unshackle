import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { NativeHelperDiagnostic } from '@/src/native/native-helper-diagnostics';
import { NativeHelperStatus } from '../NativeHelperStatus';

function diagnostic(readiness: NativeHelperDiagnostic['readiness']): NativeHelperDiagnostic {
  return {
    readiness,
    permission: readiness === 'permission-needed' ? 'unknown' : 'granted',
    install: readiness === 'host-missing' ? 'missing' : 'registered',
    ffmpeg: readiness === 'ffmpeg-missing' ? 'missing' : 'available',
    hostName: 'com.unshackle.ffmpeg',
    checkedAt: 100,
  };
}

test('shows helper ready status', () => {
  render(<NativeHelperStatus diagnostic={diagnostic('ready')} onCheck={vi.fn()} />);
  expect(screen.getByText(/native ffmpeg helper/i)).toBeInTheDocument();
  expect(screen.getByText(/ready/i)).toBeInTheDocument();
});

test('shows permission needed status with enable action', () => {
  render(
    <NativeHelperStatus
      diagnostic={diagnostic('permission-needed')}
      onRequestPermission={vi.fn()}
      onCheck={vi.fn()}
    />,
  );
  expect(screen.getByText(/permission needed/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /enable native helper/i })).toBeInTheDocument();
});

test('shows helper missing status with setup action', () => {
  render(
    <NativeHelperStatus
      diagnostic={diagnostic('host-missing')}
      onOpenSetup={vi.fn()}
      onCheck={vi.fn()}
    />,
  );
  expect(screen.getByText(/install helper/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /open setup/i })).toBeInTheDocument();
});

test('shows ffmpeg missing status', () => {
  render(<NativeHelperStatus diagnostic={diagnostic('ffmpeg-missing')} onCheck={vi.fn()} />);
  expect(screen.getByText(/ffmpeg missing/i)).toBeInTheDocument();
});

test('diagnostics action exposes status codes', async () => {
  const user = userEvent.setup();
  render(<NativeHelperStatus diagnostic={diagnostic('host-missing')} onCheck={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: /diagnostics/i }));

  expect(screen.getByLabelText(/readiness code/i)).toHaveValue('host-missing');
});
