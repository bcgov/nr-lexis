import { expect, type Page } from '@playwright/test'

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'

export const DEV_ROLES_STORAGE_KEY = 'lexis.dev.roles'

export const bootstrapDevRoles = async (
  page: Page,
  roles: string[] = ['ADMIN'],
): Promise<void> => {
  await page.addInitScript(
    ({ key, configuredRoles }: { key: string; configuredRoles: string[] }) => {
      window.localStorage.setItem(key, JSON.stringify(configuredRoles))
    },
    { key: DEV_ROLES_STORAGE_KEY, configuredRoles: roles },
  )
}

export const gotoProtectedRoute = async (page: Page, path: string): Promise<void> => {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('banner', { name: /nr lexis/i })).toBeVisible({ timeout: 30000 })
}
