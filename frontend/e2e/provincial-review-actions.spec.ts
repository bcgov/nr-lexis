import { expect, test } from '@playwright/test'
import { bootstrapDevRoles, gotoProtectedRoute } from './utils'

test.describe('provincial review table action states', () => {
  test('selection and status drive action button enablement', async ({ page }) => {
    await bootstrapDevRoles(page, ['ADMIN'])
    await gotoProtectedRoute(page, '/provincial/review')

    const approveSelectedButton = page.getByRole('button', {
      name: /approve selected applications/i,
    })
    const updateSelectedStatusButton = page.getByRole('button', {
      name: /^update selected status$/i,
    })
    const updateAndSendEmailButton = page.getByRole('button', {
      name: /update status and send email/i,
    })

    await expect(approveSelectedButton).toBeDisabled()
    await expect(updateSelectedStatusButton).toBeDisabled()
    await expect(updateAndSendEmailButton).toBeDisabled()

    const selectableRowCheckbox = page.locator('input[id^="selectRow-"]:not([disabled])').first()
    await expect(selectableRowCheckbox).toBeAttached()

    await selectableRowCheckbox.setChecked(true, { force: true })
    await expect(approveSelectedButton).toBeEnabled()
    await expect(updateSelectedStatusButton).toBeDisabled()
    await expect(updateAndSendEmailButton).toBeDisabled()

    await page.selectOption('#reviewStatusCode', 'EXP')
    await expect(updateSelectedStatusButton).toBeEnabled()
    await expect(updateAndSendEmailButton).toBeDisabled()

    await page.selectOption('#reviewStatusCode', 'REJ')
    await expect(updateAndSendEmailButton).toBeEnabled()

    await selectableRowCheckbox.setChecked(false, { force: true })
    await expect(approveSelectedButton).toBeDisabled()
    await expect(updateSelectedStatusButton).toBeDisabled()
    await expect(updateAndSendEmailButton).toBeDisabled()
  })
})
