import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
