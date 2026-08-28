import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    // e2e/ is Playwright's. Vitest picking it up fails with "Playwright Test
    // did not expect test.describe() to be called here", which reads like a
    // broken spec rather than the wrong runner.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});