import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/web-owner/src'),
      '@dbi/shared-types': path.resolve(__dirname, './packages/shared-types/src/index.ts')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./apps/web-owner/vitest.setup.ts']
  }
});
