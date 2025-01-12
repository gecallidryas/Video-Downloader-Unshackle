import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { TrimControls } from '../TrimControls';

test('renders no trim controls for direct downloads', () => {
  const { container } = render(
    <TrimControls
      enabled={false}
      value={null}
      onChange={() => {}}
    />,
  );

  expect(container).toBeEmptyDOMElement();
});

test('normalizes start and end seconds from text inputs', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(
    <TrimControls
      enabled
      value={null}
      onChange={onChange}
    />,
  );

  await user.type(screen.getByLabelText(/trim start/i), '1:30');
  await user.type(screen.getByLabelText(/trim end/i), '2:45');
  await user.tab();

  expect(onChange).toHaveBeenLastCalledWith({
    startSec: 90,
    endSec: 165,
  });
});
