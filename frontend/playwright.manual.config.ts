import { defineConfig } from '@playwright/test'
import { createE2EConfig } from './e2e/playwright-config'

const config = createE2EConfig({ testMatch: /manual\.screenshots\.spec\.ts/, use: {} })

// Captures the user manual screenshots; see e2e/manual.screenshots.spec.ts.
export default defineConfig({
  ...config,
  // With E2E_BASE_URL set the screens come from that environment, so no local server is started.
  webServer: process.env.E2E_BASE_URL ? undefined : config.webServer,
  reporter: [['list']],
})
