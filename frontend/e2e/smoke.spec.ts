import { expect, test } from '@playwright/test'

test.describe('frontend smoke coverage', () => {
  test('landing page renders core login shell', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: /log exemption information system/i })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /log in with idir/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /log in with business bceid/i })).toBeVisible()
  })

  test('protected routes are not directly accessible without authenticated session', async ({ page }) => {
    await page.goto('/provincial/application', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
    await expect(page.getByText(/does not exist/i)).toBeVisible()

    await page.getByRole('button', { name: /back home/i }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: /log in with idir/i })).toBeVisible()
  })
})
