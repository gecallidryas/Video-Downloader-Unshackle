import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { OverflowMenu } from '../OverflowMenu';

const actions = [
  { id: 'copy', label: 'Copy URL' },
  { id: 'rename', label: 'Rename' },
  { id: 'remove', label: 'Remove', danger: true },
];

describe('OverflowMenu', () => {
  test('renders trigger button with accessible label', () => {
    render(<OverflowMenu actions={actions} onAction={vi.fn()} aria-label="Item actions" />);

    expect(screen.getByRole('button', { name: 'Item actions' })).toBeInTheDocument();
  });

  test('clicking trigger opens menu with items', async () => {
    const user = userEvent.setup();
    render(<OverflowMenu actions={actions} onAction={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /more actions/i }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(actions.length);
  });

  test('selecting an action fires onAction with the matching id and closes menu', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<OverflowMenu actions={actions} onAction={onAction} />);

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /copy url/i }));

    expect(onAction).toHaveBeenCalledWith('copy');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('Escape closes the menu', async () => {
    const user = userEvent.setup();
    render(<OverflowMenu actions={actions} onAction={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('clicking outside closes the menu', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Outside</button>
        <OverflowMenu actions={actions} onAction={vi.fn()} />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('danger item gets danger class', async () => {
    const user = userEvent.setup();
    render(<OverflowMenu actions={actions} onAction={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /more actions/i }));

    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveClass(
      'overflow-menu__item--danger',
    );
  });

  test('disabled item does not fire onAction', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <OverflowMenu
        actions={[{ id: 'disabled', label: 'Disabled', disabled: true }]}
        onAction={onAction}
      />,
    );

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Disabled' }));

    expect(onAction).not.toHaveBeenCalled();
  });
});
