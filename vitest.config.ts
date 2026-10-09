import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.ts'],
      // The bundled engines are measured in their own repositories.
      exclude: ['vendor/**'],
      reporter: ['text', 'html'],
      thresholds: {
        statements: 98,
        branches: 95,
        functions: 100,
        lines: 99,
      },
    },
  },
});
