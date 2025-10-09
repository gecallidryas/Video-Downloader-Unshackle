import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { StorageFooter } from '../StorageFooter';

describe('StorageFooter', () => {
  test('renders usage, quota, and percent text', () => {
    render(
      <StorageFooter
        usageBytes={1_200_000_000}
        quotaBytes={5_000_000_000}
        level="ok"
      />,
    );

    expect(screen.getByText(/1\.1 GB \/ 4\.7 GB \(24%\)/)).toBeInTheDocument();
  });

  test('progressbar aria reflects percent', () => {
    render(
      <StorageFooter usageBytes={500} quotaBytes={1000} level="moderate" />,
    );

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  test('applies level modifier class', () => {
    const { container } = render(
      <StorageFooter usageBytes={950} quotaBytes={1000} level="critical" />,
    );

    expect(container.firstChild).toHaveClass('storage-footer--critical');
  });

  test('clamps usage above quota to 100%', () => {
    render(<StorageFooter usageBytes={2000} quotaBytes={1000} level="high" />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  test('reports 0% when quota is zero', () => {
    render(<StorageFooter usageBytes={100} quotaBytes={0} level="ok" />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});
