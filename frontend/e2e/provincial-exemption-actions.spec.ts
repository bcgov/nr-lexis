import { expect, test } from '@playwright/test'
import { bootstrapDevRoles, gotoProtectedRoute } from './utils'

test.describe('provincial exemption table action states', () => {
  test('approval selection rules drive approve button and status message', async ({ page }) => {
    await bootstrapDevRoles(page, ['ADMIN'])
    await gotoProtectedRoute(page, '/provincial/exemption')

    const approveButton = page.getByRole('button', { name: /approve selected exemption/i })
    await expect(approveButton).toBeDisabled()

    const selectableNewRow = page.locator('#selectRow-E-50005')
    const approvedRow = page.locator('#selectRow-E-50002')
    const lockedNewRow = page.locator('#selectRow-E-50003')

    await expect(selectableNewRow).toBeVisible()
    await expect(selectableNewRow).toBeEnabled()
    await expect(approvedRow).toBeDisabled()
    await expect(lockedNewRow).toBeDisabled()

    await selectableNewRow.setChecked(true, { force: true })
    await expect(approveButton).toBeEnabled()

    await approveButton.click()
    await expect(page.getByText(/Ready to approve 1 selected exemption\(s\)\./i)).toBeVisible()

    await selectableNewRow.setChecked(false, { force: true })
    await expect(approveButton).toBeDisabled()
  })
})
