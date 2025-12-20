import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { TrimSlider } from '../TrimSlider';

test('renders nothing when disabled', () => {
  const { container } = render(
    <TrimSlider enabled={false} duration={100} value={null} onChange={() => {}} />,
  );
  expect(container).toBeEmptyDOMElement();
});

test('renders nothing when duration is zero', () => {
  const { container } = render(
    <TrimSlider enabled duration={0} value={null} onChange={() => {}} />,
  );
  expect(container).toBeEmptyDOMElement();
});

test('renders trim range with two slider handles', () => {
  render(
    <TrimSlider enabled duration={120} value={null} onChange={() => {}} />,
  );

  expect(screen.getByLabelText(/trim range/i)).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: /trim start/i })).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: /trim end/i })).toBeInTheDocument();
});

test('displays current trim values', () => {
  render(
    <TrimSlider
      enabled
      duration={120}
      value={{ startSec: 10, endSec: 90 }}
      onChange={() => {}}
    />,
  );

  expect(screen.getByText(/0:10/)).toBeInTheDocument();
  expect(screen.getByText(/1:30/)).toBeInTheDocument();
});

test('reset button clears trim to null', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <TrimSlider
      enabled
      duration={120}
      value={{ startSec: 10, endSec: 90 }}
      onChange={onChange}
    />,
  );

  await user.click(screen.getByRole('button', { name: /reset trim/i }));
  expect(onChange).toHaveBeenCalledWith(null);
});

test('reset button not shown when no trim active', () => {
  render(
    <TrimSlider enabled duration={120} value={null} onChange={() => {}} />,
  );

  expect(screen.queryByRole('button', { name: /reset trim/i })).not.toBeInTheDocument();
});

test('slider handles have correct aria attributes', () => {
  render(
    <TrimSlider
      enabled
      duration={60}
      value={{ startSec: 5, endSec: 50 }}
      onChange={() => {}}
    />,
  );

  const startHandle = screen.getByRole('slider', { name: /trim start/i });
  expect(startHandle).toHaveAttribute('aria-valuenow', '5');
  expect(startHandle).toHaveAttribute('aria-valuemax', '60');

  const endHandle = screen.getByRole('slider', { name: /trim end/i });
  expect(endHandle).toHaveAttribute('aria-valuenow', '50');
});

test('keyboard nudges trim handles without crossing the range', () => {
  const onChange = vi.fn();
  render(
    <TrimSlider
      enabled
      duration={60}
      value={{ startSec: 5, endSec: 50 }}
      onChange={onChange}
    />,
  );

  fireEvent.keyDown(screen.getByRole('slider', { name: /trim start/i }), {
    key: 'ArrowRight',
  });
  expect(onChange).toHaveBeenLastCalledWith({ startSec: 6, endSec: 50 });

  fireEvent.keyDown(screen.getByRole('slider', { name: /trim end/i }), {
    key: 'ArrowLeft',
  });
  expect(onChange).toHaveBeenLastCalledWith({ startSec: 5, endSec: 49 });
});
