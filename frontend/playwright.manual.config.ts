import { defineConfig } from '@playwright/test'
import { createE2EConfig } from './e2e/playwright-config'

// Captures the user manual screenshots from a synthetic session; see e2e/manual.screenshots.spec.ts.
export default defineConfig({
  ...createE2EConfig({ testMatch: /manual\.screenshots\.spec\.ts/, use: {} }),
  reporter: [['list']],
})
