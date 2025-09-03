import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CodecBadge } from '../CodecBadge';

describe('CodecBadge', () => {
  test('renders the formatted codec label', () => {
    render(<CodecBadge info={{ video: 'H.264', audio: 'AAC', container: 'mp4' }} />);
    expect(screen.getByText('H.264 / AAC')).toBeInTheDocument();
  });

  test('shows nothing when info is null', () => {
    const { container } = render(<CodecBadge info={null} />);
    expect(container.firstChild).toBeNull();
  });

  test('applies warning modifier when unsupported is true', () => {
    render(
      <CodecBadge info={{ video: 'HEVC', container: 'mp4' }} unsupported />,
    );
    const badge = screen.getByText('HEVC');
    expect(badge.parentElement).toHaveClass('codec-badge--warning');
    expect(badge.parentElement).toHaveAttribute(
      'title',
      expect.stringMatching(/may not play/i),
    );
  });

  test('omits warning modifier by default', () => {
    render(<CodecBadge info={{ video: 'H.264', container: 'mp4' }} />);
    const badge = screen.getByText('H.264');
    expect(badge.parentElement).not.toHaveClass('codec-badge--warning');
  });
});
