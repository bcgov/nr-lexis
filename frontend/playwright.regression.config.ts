import { defineConfig } from '@playwright/test'
import { createE2EConfig } from './e2e/playwright-config'

export default defineConfig({
  ...createE2EConfig({
    testMatch: /regression\.spec\.ts/,
    use: {
      trace: 'off',
      screenshot: 'off',
      video: 'off',
    },
  }),
  // A failed mutation may already have persisted. Never replay the whole test.
  retries: 0,
  reporter: [['./e2e/safe-regression-reporter.ts']],
})
