import { defineConfig } from 'vitest/config';

/**
 * Without an explicit exclude, vitest also collects the compiled copies of every test under
 * `build/`, which doubled the reported count (284 instead of 142) and meant a stale build
 * could keep an edited test passing. Only `src` is the source of truth.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'build/**', 'dist/**'],
  },
});
