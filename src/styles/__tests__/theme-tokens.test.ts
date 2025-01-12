import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve('src/styles/tokens.css'), 'utf8');

function extractBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = Array.from(
    css.matchAll(new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\}`, 'g')),
  );
  const match = matches.at(-1);

  return match?.groups?.body ?? '';
}

function tokenValue(block: string, token: string): string | undefined {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`${escapedToken}:\\s*([^;]+);`));

  return match?.[1]?.trim();
}

test('contrast theme uses the bold Unified dark palette as the default contract', () => {
  const root = extractBlock(':root');
  const contrast = extractBlock(':root[data-theme="contrast"]');

  expect(tokenValue(root, '--surface')).toBe('#000000');
  expect(tokenValue(root, '--primary')).toBe('#ffcc00');
  expect(tokenValue(contrast, '--surface')).toBe('#000000');
  expect(tokenValue(contrast, '--on-surface')).toBe('#fff9c2');
  expect(tokenValue(contrast, '--primary')).toBe('#ffcc00');
  expect(tokenValue(contrast, '--outline')).toBe('#333300');
});

test.each([
  ['blueberry', '#0f111a', '#5f8cff'],
  ['lightdark', '#000000', '#ffffff'],
  ['noirgold', '#0b0a08', '#c89a3f'],
  ['purplefanatic', '#0e0a17', '#b184e0'],
  ['sakura', '#130d14', '#e78fb2'],
  ['ocean', '#0a1318', '#42b8d5'],
  ['forest', '#0b120d', '#4ec27a'],
  ['slate', '#1a1c21', '#8a9bb3'],
  ['ember', '#140c0a', '#e07840'],
])('%s theme maps Unified surface and accent into current tokens', (theme, surface, primary) => {
  const block = extractBlock(`:root[data-theme="${theme}"]`);

  expect(tokenValue(block, '--surface')).toBe(surface);
  expect(tokenValue(block, '--primary')).toBe(primary);
  expect(tokenValue(block, '--surface-container-lowest')).not.toBe('#ffffff');
});

test('theme tokens expose bold UI effect hooks for current components', () => {
  const root = extractBlock(':root');

  expect(tokenValue(root, '--control-shadow')).toContain('rgba(0, 0, 0');
  expect(tokenValue(root, '--focus-glow')).toContain('var(--primary)');
  expect(tokenValue(root, '--scrollbar-thumb')).toBe('var(--primary)');
});
