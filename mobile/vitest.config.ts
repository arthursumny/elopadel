import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, '.'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/app': path.resolve(__dirname, './app'),
      'react-native': path.resolve(__dirname, './__mocks__/react-native.ts'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: [path.resolve(__dirname, './vitest.setup.ts')],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
