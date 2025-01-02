import { getSidePanelBehavior } from '../sidePanel';

test('opens side panel on action click', () => {
  expect(getSidePanelBehavior()).toEqual({ openPanelOnActionClick: true });
});
