import { defineConfig, devices } from '@playwright/test'
import { E2E_BASE_URL, LOCAL_E2E_CLIENT_ID, LOCAL_E2E_ISSUER_URI } from './e2e/utils'

const isRemoteE2E = !!process.env.CI && /^https?:\/\//.test(E2E_BASE_URL)

export default defineConfig({
  // Leave room for the same bounded frontend recovery used by the regression suite.
  timeout: 240000,
  testDir: './e2e',
  testMatch: /smoke\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['line'], ['list', { printSteps: true }], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
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
