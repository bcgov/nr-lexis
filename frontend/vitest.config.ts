import { defineConfig } from 'vitest/config'

const coverageThresholds =
  process.env.LEXIS_VITEST_SHARD === 'true'
    ? {}
    : {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      }

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    exclude: ['**/node_modules/**', '**/e2e/**'],
    globals: true,
    environment: 'jsdom',
    setupFiles: 'src/test-setup.ts',
    // you might want to disable it, if you don't have tests that rely on CSS
    // since parsing CSS is slow
    css: false,
    coverage: {
      reporter: ['lcov', 'text-summary', 'text', 'json', 'html'],
      // CI merges shard coverage before enforcing the full-suite threshold.
      thresholds: coverageThresholds,
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/coverage/**',
        '**/*.config.*',
        'src/routeTree.gen.ts', // Auto-generated file
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.tsx',
        'src/__tests__/**',
        'src/**/__tests__/**/*.support.ts',
        'src/**/__tests__/**/*.support.tsx',
      ],
    },
  },
})
