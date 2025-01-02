import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Video Downloader - Unshackle',
    description: 'A premium side-panel video downloader shell with mocked flows.',
    version: '0.1.0',
    minimum_chrome_version: '116',
  },
});
