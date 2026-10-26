import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/api/**/*.test.ts', 'tests/config/**/*.test.ts', 'tests/notifications/**/*.test.ts'],
  },

});
