import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve('src/ui/media/MediaCard.css'), 'utf8');

test('media cards use bold theme hooks for borders, depth, and primary actions', () => {
  expect(css).toContain('border: 1px solid var(--outline)');
  expect(css).toContain('box-shadow: var(--control-shadow)');
  expect(css).toContain('border-color: var(--primary)');
  expect(css).toContain('background: var(--primary)');
  expect(css).toContain('color: var(--primary-action-text)');
});
