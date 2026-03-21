import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    // Pins a deterministic extension ID (gljdakohnaibpophgamklloippklkdol) so the
    // native messaging host manifest's allowed_origins stays valid across installs.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqavQuZ6CyD2gHgAImc79yLUVMErhDK2Mi1/EtjYcVqitps1ptBOpjdNLgRNG36kgMJAV9E0wtXf+u/G8cK9PC6Rd4++D9TY9KKQZx+EZvOWNMgtEJ3IwvhRvGqSg6ZXcN2m9Uk7xbOkLDd3OXFoHCnAT6CZ8aKNkquXTlSuMPZcAYtK9mzJ9KUqCLS2o/xfWcsakeV00LrLrTjBAukmELNMf+RXidv7J3q/gAYaLEiDzMKuopuJ7eVQVWo4Bin6IwbGpti8Qm8uuRI6TNGPzEgEmZRul+L7RrZAcfvtrxCD5NLKrpnT4b3ph7VgHMwweTHNwhJBiJMdk0cw/MlpzqwIDAQAB',
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
