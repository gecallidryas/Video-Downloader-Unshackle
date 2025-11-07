import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Video Downloader - Unshackle',
    description: 'Detect and download HLS, DASH, and direct video/audio streams with a side-panel UI, queue management, and native FFmpeg export.',
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
