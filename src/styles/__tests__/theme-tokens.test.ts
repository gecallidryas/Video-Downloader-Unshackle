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

test('root uses minimal dark monochrome palette', () => {
  const root = extractBlock(':root');

  expect(tokenValue(root, '--surface')).toBe('#000000');
  expect(tokenValue(root, '--on-surface')).toBe('#b0b0b0');
  expect(tokenValue(root, '--primary')).toBe('#b0b0b0');
  expect(tokenValue(root, '--outline')).toBe('#222222');
  expect(tokenValue(root, '--background')).toBe('#000000');
});

test('light theme uses stitch Precision Panel palette', () => {
  const light = extractBlock(':root[data-theme="light"]');

  expect(tokenValue(light, '--surface')).toBe('#f8f9ff');
  expect(tokenValue(light, '--on-surface')).toBe('#0b1c30');
  expect(tokenValue(light, '--primary')).toBe('#0050cb');
  expect(tokenValue(light, '--outline')).toBe('#727687');
  expect(tokenValue(light, '--background')).toBe('#f8f9ff');
  expect(tokenValue(light, '--primary-container')).toBe('#0066ff');
});

test('only dark and light themes exist', () => {
  const themeMatches = css.match(/data-theme="/g) ?? [];
  expect(themeMatches).toHaveLength(2);
  expect(css).toContain('data-theme="light"');
});

test('stitch design tokens preserved for typography and spacing', () => {
  const root = extractBlock(':root');

  expect(tokenValue(root, '--font-base')).toContain('Inter');
  expect(tokenValue(root, '--text-body-size')).toBe('13px');
  expect(tokenValue(root, '--panel-padding')).toBe('12px');
  expect(tokenValue(root, '--stack-gap')).toBe('8px');
  expect(tokenValue(root, '--radius')).toBe('0.25rem');
});
