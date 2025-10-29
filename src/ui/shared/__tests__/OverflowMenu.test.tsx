import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { OverflowMenu } from '../OverflowMenu';

describe('OverflowMenu', () => {
  test('renders trigger button and opens menu on click', async () => {
    const user = userEvent.setup();
    render(<OverflowMenu actions={[{ id: 'copy', label: 'Copy URL' }]} onAction={() => {}} />);
    const trigger = screen.getByRole('button', { name: /more actions/i });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /copy url/i })).toBeInTheDocument();
  });

  test('invokes onAction with action id', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <OverflowMenu
        actions={[{ id: 'remove', label: 'Remove', danger: true }]}
        onAction={onAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /remove/i }));
    expect(onAction).toHaveBeenCalledWith('remove');
  });

  test('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<OverflowMenu actions={[{ id: 'a', label: 'A' }]} onAction={() => {}} />);
    await user.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('disabled items are not clickable', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <OverflowMenu
        actions={[{ id: 'd', label: 'Disabled', disabled: true }]}
        onAction={onAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: /more actions/i }));
    const item = screen.getByRole('menuitem', { name: /disabled/i });
    expect(item).toBeDisabled();
  });
});
