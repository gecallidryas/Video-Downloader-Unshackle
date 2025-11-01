import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { LanguagePicker } from '../LanguagePicker';

describe('LanguagePicker', () => {
  test('renders common languages plus Other and No preference', () => {
    render(<LanguagePicker value="" onChange={() => {}} />);
    const select = screen.getByRole('combobox', { name: /preferred language/i });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /english/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /japanese/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /other/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /no preference/i })).toBeInTheDocument();
  });

  test('fires onChange with selected code', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LanguagePicker value="" onChange={onChange} />);
    await user.selectOptions(screen.getByRole('combobox', { name: /preferred language/i }), 'fr');
    expect(onChange).toHaveBeenCalledWith('fr');
  });

  test('Other reveals free-text input and emits typed code', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LanguagePicker value="" onChange={onChange} />);
    await user.selectOptions(screen.getByRole('combobox', { name: /preferred language/i }), '__other__');
    const input = screen.getByRole('textbox', { name: /custom language code/i });
    await user.type(input, 's');
    expect(onChange).toHaveBeenLastCalledWith('s');
  });

  test('shows free-text input when value is a non-common code', () => {
    render(<LanguagePicker value="sv" onChange={() => {}} />);
    const input = screen.getByRole('textbox', { name: /custom language code/i });
    expect(input).toHaveValue('sv');
  });
});
