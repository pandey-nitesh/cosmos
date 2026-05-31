import { defineConfig } from 'vitest/config';

// The compliance engine is pure (no Workers runtime needed), so we test it with
// the standard Node test environment for speed and simplicity.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
