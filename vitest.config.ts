import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/.output/**',
      'e2e/**',
      'UnifiedVideoDownloader/**',
      'reference/**',
    ],
  },
});
