import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { DuplicateBadge } from '../DuplicateBadge';

describe('DuplicateBadge', () => {
  test('renders count label', () => {
    render(<DuplicateBadge count={3} onClick={() => {}} />);

    expect(screen.getByRole('button', { name: /3 duplicates/i })).toBeInTheDocument();
  });

  test('uses singular form for count of 1', () => {
    render(<DuplicateBadge count={1} onClick={() => {}} />);

    expect(screen.getByRole('button', { name: /1 duplicate$/i })).toBeInTheDocument();
  });

  test('clicking the badge fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<DuplicateBadge count={2} onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: /2 duplicates/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
