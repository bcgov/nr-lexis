import { devices } from '@playwright/test'
import type { PlaywrightTestConfig } from '@playwright/test'
import { E2E_BASE_URL } from './utils'

const E2E_TIMEOUT_MS = 120_000

const isRemoteE2E = !!process.env.CI && /^https?:\/\//.test(E2E_BASE_URL)

type E2EConfigOptions = {
  testMatch: RegExp
  use: NonNullable<PlaywrightTestConfig['use']>
}

export const createE2EConfig = ({ testMatch, use }: E2EConfigOptions): PlaywrightTestConfig => ({
  timeout: E2E_TIMEOUT_MS,
  testDir: './e2e',
  testMatch,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['line'], ['list', { printSteps: true }], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_BASE_URL,
    ...use,
  },
  webServer: isRemoteE2E
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: E2E_TIMEOUT_MS,
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
