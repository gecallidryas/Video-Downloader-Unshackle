import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { FilterInput } from '../FilterInput';

describe('FilterInput', () => {
  test('renders with placeholder and value', () => {
    render(
      <FilterInput
        value="hello"
        onChange={() => {}}
        placeholder="Search"
        debounceMs={0}
      />,
    );

    const input = screen.getByPlaceholderText('Search') as HTMLInputElement;
    expect(input.value).toBe('hello');
  });

  test('debounces onChange invocations', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<FilterInput value="" onChange={onChange} debounceMs={100} />);

    await user.type(screen.getByRole('searchbox'), 'foo');

    expect(onChange).not.toHaveBeenCalledWith('fo');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('foo'));
  });

  test('fires immediately when debounceMs=0', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<FilterInput value="" onChange={onChange} debounceMs={0} />);

    await user.type(screen.getByRole('searchbox'), 'a');

    expect(onChange).toHaveBeenLastCalledWith('a');
  });

  test('clear button resets value and calls onChange with empty string', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<FilterInput value="hello" onChange={onChange} debounceMs={0} />);

    await user.click(screen.getByRole('button', { name: /clear filter/i }));

    expect(onChange).toHaveBeenCalledWith('');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });

  test('clear button is hidden when value is empty', () => {
    render(<FilterInput value="" onChange={() => {}} />);

    expect(screen.queryByRole('button', { name: /clear filter/i })).not.toBeInTheDocument();
  });
});
