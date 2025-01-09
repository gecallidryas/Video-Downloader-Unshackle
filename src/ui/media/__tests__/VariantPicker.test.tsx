import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { VariantPicker } from '../VariantPicker';

const variants = [
  { label: '1080p', value: 'variant-1080' },
  { label: '720p', value: 'variant-720' },
];

test('renders no selector when there are no quality variants', () => {
  const { container } = render(
    <VariantPicker
      options={[]}
      selectedValue=""
      onChange={() => {}}
    />,
  );

  expect(container).toBeEmptyDOMElement();
});

test('renders quality options and reports the selected variant', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(
    <VariantPicker
      options={variants}
      selectedValue="variant-1080"
      onChange={onChange}
    />,
  );

  await user.selectOptions(
    screen.getByRole('combobox', { name: /quality/i }),
    'variant-720',
  );

  expect(onChange).toHaveBeenCalledWith('variant-720');
});
