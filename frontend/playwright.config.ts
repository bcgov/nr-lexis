import { defineConfig, devices } from '@playwright/test'
import { E2E_BASE_URL } from './e2e/utils'

const isRemoteE2E = !!process.env.CI && /^https?:\/\//.test(E2E_BASE_URL)

export default defineConfig({
  timeout: 120000,
  testDir: './e2e',
  testMatch: /smoke\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['line'],
    ['list', { printSteps: true }],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: isRemoteE2E
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: E2E_BASE_URL,
      },
    },
  ],
})
