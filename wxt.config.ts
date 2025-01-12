import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Video Downloader - Unshackle',
    description: 'A premium side-panel video downloader shell with mocked flows.',
    version: '0.1.0',
    minimum_chrome_version: '116',
    permissions: [
      'activeTab',
      'sidePanel',
      'storage',
      'tabs',
      'webRequest',
      'downloads',
      'offscreen',
      'scripting',
      'contextMenus',
      'declarativeContent',
      'alarms',
      'notifications',
    ],
    host_permissions: ['<all_urls>'],
    optional_permissions: ['nativeMessaging'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
});
