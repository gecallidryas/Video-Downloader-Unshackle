import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { QRModal } from '../QRModal';

describe('QRModal', () => {
  test('does not render when closed', () => {
    render(<QRModal url="https://example.com/v" open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('renders SVG QR code for safe URL', () => {
    render(<QRModal url="https://example.com/v.mp4" open onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /qr code/i })).toBeInTheDocument();
  });

  test('warns and refuses to render QR for URLs with auth tokens', () => {
    render(
      <QRModal
        url="https://example.com/v?token=abc"
        open
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/not safe/i);
    expect(screen.queryByRole('img')).toBeNull();
  });

  test('Close button fires onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<QRModal url="https://example.com/v" open onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /close qr/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
