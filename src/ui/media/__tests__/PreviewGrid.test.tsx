import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PreviewGrid, type PreviewGridItem } from '../PreviewGrid';

type ObserverCallback = (entries: IntersectionObserverEntry[]) => void;

class FakeIntersectionObserver implements IntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  readonly scrollMargin = '';
  private readonly callback: ObserverCallback;
  private readonly targets = new Set<Element>();

  constructor(callback: ObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }
  unobserve(target: Element): void {
    this.targets.delete(target);
  }
  disconnect(): void {
    this.targets.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  triggerAll(intersecting = true): void {
    const entries = Array.from(this.targets).map(
      (target) =>
        ({
          target,
          isIntersecting: intersecting,
          intersectionRatio: intersecting ? 1 : 0,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          time: 0,
        }) as IntersectionObserverEntry,
    );
    this.callback(entries);
  }
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: FakeIntersectionObserver,
  });
});

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
});

function makeItems(): PreviewGridItem[] {
  return [
    {
      id: 'a',
      url: 'https://example.com/a.mp4',
      filename: 'movie.mp4',
      thumbnailUrl: 'https://example.com/a.jpg',
      durationSec: 60,
      sizeBytes: 1_000_000,
      detectedAt: 1000,
    },
    {
      id: 'b',
      url: 'https://example.com/b.mp4',
      filename: 'movie.mp4',
      thumbnailUrl: 'https://example.com/b.jpg',
      durationSec: 120,
      sizeBytes: 2_000_000,
      detectedAt: 2000,
    },
    {
      id: 'c',
      url: 'https://example.com/c.mp4',
      filename: 'other.mp4',
      thumbnailUrl: null,
      probeFailed: true,
      durationSec: 30,
      sizeBytes: 500_000,
      detectedAt: 3000,
    },
  ];
}

describe('PreviewGrid', () => {
  test('renders nothing when advancedMode is false', () => {
    const { container } = render(
      <PreviewGrid advancedMode={false} items={makeItems()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders one cell per item with checkbox', () => {
    render(<PreviewGrid advancedMode items={makeItems()} />);
    expect(screen.getAllByRole('gridcell')).toHaveLength(3);
    expect(screen.getAllByRole('checkbox', { name: /select/i })).toHaveLength(3);
  });

  test('groups duplicate filenames with a count badge', () => {
    render(<PreviewGrid advancedMode items={makeItems()} />);
    expect(screen.getByText('×2')).toBeInTheDocument();
  });

  test('failed probes show broken-image placeholder and retry overlay', async () => {
    const onRetryProbe = vi.fn();
    const user = userEvent.setup();
    render(
      <PreviewGrid advancedMode items={makeItems()} onRetryProbe={onRetryProbe} />,
    );

    const retry = screen.getByRole('button', { name: /retry probe for other.mp4/i });
    await user.click(retry);
    expect(onRetryProbe).toHaveBeenCalledWith('c');
  });

  test('lazy loads thumbnails only after intersection observed', () => {
    render(<PreviewGrid advancedMode items={makeItems()} />);

    const initial = screen.queryAllByRole('img');
    expect(initial).toHaveLength(0);

    const observer = FakeIntersectionObserver.instances[0];
    expect(observer).toBeDefined();
    act(() => {
      observer.triggerAll(true);
    });

    const loaded = screen.getAllByRole('img');
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded[0]).toHaveAttribute('src', 'https://example.com/a.jpg');
  });

  test('sort selector reorders cells', async () => {
    const user = userEvent.setup();
    render(<PreviewGrid advancedMode items={makeItems()} />);
    const select = screen.getByLabelText(/sort by/i);
    await user.selectOptions(select, 'duration');
    const cells = screen.getAllByRole('gridcell');
    expect(within(cells[0]).getByText(/30s/)).toBeInTheDocument();
  });

  test('batch toolbar fires actions on selected items', async () => {
    const onDownloadSelected = vi.fn();
    const onCopyUrls = vi.fn();
    const onRemoveSelected = vi.fn();
    const user = userEvent.setup();

    render(
      <PreviewGrid
        advancedMode
        items={makeItems()}
        onDownloadSelected={onDownloadSelected}
        onCopyUrls={onCopyUrls}
        onRemoveSelected={onRemoveSelected}
      />,
    );

    await user.click(screen.getAllByRole('checkbox', { name: /select/i })[0]);
    await user.click(screen.getAllByRole('checkbox', { name: /select/i })[1]);

    await user.click(screen.getByRole('button', { name: /download selected/i }));
    expect(onDownloadSelected).toHaveBeenCalledWith(['a', 'b']);

    await user.click(screen.getByRole('button', { name: /copy urls/i }));
    expect(onCopyUrls).toHaveBeenCalledWith([
      'https://example.com/a.mp4',
      'https://example.com/b.mp4',
    ]);

    await user.click(screen.getByRole('button', { name: /remove selected/i }));
    expect(onRemoveSelected).toHaveBeenCalledWith(['a', 'b']);
  });
});
