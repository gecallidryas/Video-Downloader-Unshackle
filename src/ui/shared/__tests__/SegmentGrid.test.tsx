import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { SegmentGrid, type SegmentCell } from '../SegmentGrid';

function makeSegments(count: number): SegmentCell[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    status: i % 3 === 0 ? 'done' : i % 3 === 1 ? 'failed' : 'pending',
  }));
}

describe('SegmentGrid', () => {
  test('renders one cell per segment with status class', () => {
    render(<SegmentGrid segments={makeSegments(3)} />);

    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveClass('segment-grid__cell--done');
    expect(cells[1]).toHaveClass('segment-grid__cell--failed');
    expect(cells[2]).toHaveClass('segment-grid__cell--pending');
  });

  test('clicking a cell fires onSegmentClick with index', async () => {
    const onSegmentClick = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentGrid segments={makeSegments(4)} onSegmentClick={onSegmentClick} />,
    );

    await user.click(screen.getAllByRole('gridcell')[2]);

    expect(onSegmentClick).toHaveBeenCalledWith(2);
  });

  test('shift-click sets range from existing selection start to clicked index', async () => {
    const onRangeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentGrid
        segments={makeSegments(6)}
        selectedRange={{ start: 1, end: 1 }}
        onRangeChange={onRangeChange}
      />,
    );

    await user.keyboard('{Shift>}');
    await user.click(screen.getAllByRole('gridcell')[4]);
    await user.keyboard('{/Shift}');

    expect(onRangeChange).toHaveBeenCalledWith({ start: 1, end: 4 });
  });

  test('selected range cells receive selected modifier class', () => {
    render(
      <SegmentGrid
        segments={makeSegments(5)}
        selectedRange={{ start: 1, end: 3 }}
      />,
    );

    const cells = screen.getAllByRole('gridcell');
    expect(cells[0]).not.toHaveClass('segment-grid__cell--selected');
    expect(cells[1]).toHaveClass('segment-grid__cell--selected');
    expect(cells[2]).toHaveClass('segment-grid__cell--selected');
    expect(cells[3]).toHaveClass('segment-grid__cell--selected');
    expect(cells[4]).not.toHaveClass('segment-grid__cell--selected');
  });

  test('exposes status in cell title for tooltip and aria-label', () => {
    render(<SegmentGrid segments={[{ index: 7, status: 'failed' }]} />);

    const cell = screen.getByRole('gridcell');
    expect(cell).toHaveAttribute('title', '#7 • failed');
    expect(cell).toHaveAttribute('aria-label', 'Segment 7 failed');
  });
});
