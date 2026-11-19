import { defineConfig } from '@playwright/test'
import { createE2EConfig } from './e2e/playwright-config'

// A failure snapshot of the sign-in page would hold the typed password. Set the variable to empty
// to keep snapshots when running only specs that never sign in.
process.env.PLAYWRIGHT_NO_COPY_PROMPT ??= '1'

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
