import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sidePanelCss = readFileSync(
  resolve('src/app/surfaces/sidepanel/SidePanelApp.css'),
  'utf8',
);
const popupCss = readFileSync(
  resolve('src/app/surfaces/popup/PopupApp.css'),
  'utf8',
);
const headerCss = readFileSync(resolve('src/ui/layout/PanelHeader.css'), 'utf8');
const navCss = readFileSync(resolve('src/ui/layout/BottomNav.css'), 'utf8');

test('panel chrome uses the bold Unified theme hooks', () => {
  expect(sidePanelCss).toContain('background: var(--surface)');
  expect(sidePanelCss).toContain('scrollbar-color: var(--scrollbar-thumb) transparent');
  expect(headerCss).toContain('box-shadow: var(--control-shadow)');
  expect(navCss).toContain('border-top: 1px solid var(--outline)');
});

test('settings controls use accent borders and focus glow', () => {
  expect(popupCss).toContain('border: 1px solid var(--outline)');
  expect(popupCss).toContain('border-color: var(--primary)');
  expect(popupCss).toContain('box-shadow: var(--focus-glow)');
});
