import { devices } from '@playwright/test'
import type { PlaywrightTestConfig } from '@playwright/test'
import { E2E_BASE_URL, LOCAL_E2E_CLIENT_ID, LOCAL_E2E_ISSUER_URI } from './utils'

// Leave room for the 150-second frontend recovery window and the test's assertions.
const E2E_TIMEOUT_MS = 240_000

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
  retries: process.env.CI ? 1 : 0,
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
        env: {
          VITE_OIDC_ISSUER_URI: process.env.VITE_OIDC_ISSUER_URI ?? LOCAL_E2E_ISSUER_URI,
          VITE_OIDC_CLIENT_ID: process.env.VITE_OIDC_CLIENT_ID ?? LOCAL_E2E_CLIENT_ID,
        },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
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
