import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      { extends: true, test: { name: 'core', include: ['src/core/**/*.test.ts', 'src/shared/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'worker', include: ['worker/**/*.test.ts', 'rozpis/**/*.test.ts'], environment: 'node', testTimeout: 30000 } },
      { extends: true, test: { name: 'app', include: ['src/app/**/*.test.{ts,tsx}'], environment: 'jsdom', setupFiles: ['src/app/test-setup.ts'], testTimeout: 15000, hookTimeout: 15000 } },
    ],
  },
});
