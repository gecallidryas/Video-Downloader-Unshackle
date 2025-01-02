import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground({
  type: 'module',
  main() {
    // Open the side panel when the extension icon is clicked
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  },
});
