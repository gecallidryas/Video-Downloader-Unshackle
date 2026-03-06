import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Video Downloader - Unshackle',
    description: 'Detect and download HLS, DASH, and direct video/audio streams with a side-panel UI, queue management, and native FFmpeg export.',
    version: '0.1.0',
    minimum_chrome_version: '116',
    icons: {
      16: '/icon-16.png',
      32: '/icon-32.png',
      48: '/icon-48.png',
      128: '/icon-128.png',
    },
    permissions: [
      'activeTab',
      'sidePanel',
      'storage',
      'unlimitedStorage',
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
    browser_specific_settings: {
      gecko: {
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
    commands: {
      'pause-all': {
        suggested_key: {
          default: 'Ctrl+Shift+P',
          mac: 'Command+Shift+P',
        },
        description: 'Pause all active downloads',
      },
      'clear-completed': {
        suggested_key: {
          default: 'Ctrl+Shift+X',
          mac: 'Command+Shift+X',
        },
        description: 'Clear completed downloads from the queue',
      },
      'open-side-panel': {
        suggested_key: {
          default: 'Ctrl+Shift+D',
          mac: 'Command+Shift+D',
        },
        description: 'Open the Video Downloader side panel',
      },
    },
  },
});
