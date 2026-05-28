import { expect, test } from '@playwright/test'
import { bootstrapDevRoles, gotoProtectedRoute } from './utils'

test.describe('provincial application table action states', () => {
  test('mismatched selected clients block create exemption', async ({ page }) => {
    await bootstrapDevRoles(page, ['ADMIN'])
    await gotoProtectedRoute(page, '/provincial/application')

    const createExemptionButton = page.getByRole('button', {
      name: /create exemption for selected applications/i,
    })

    await expect(createExemptionButton).toBeDisabled()

    const rowA10012 = page.locator('#selectRow-A-10012')
    const rowA10011 = page.locator('#selectRow-A-10011')

    await expect(rowA10012).toBeVisible()
    await expect(rowA10011).toBeVisible()

    await rowA10012.setChecked(true, { force: true })
    await expect(createExemptionButton).toBeEnabled()

    await rowA10011.setChecked(true, { force: true })
    await createExemptionButton.click()

    await expect(page).toHaveURL(/\/provincial\/application(?:\?.*)?$/)
    await expect(
      page.getByText(/Selected applications do not share the same client numbers\./i),
    ).toBeVisible()
  })

  test('single selection prefills exemption create route', async ({ page }) => {
    await bootstrapDevRoles(page, ['ADMIN'])
    await gotoProtectedRoute(page, '/provincial/application')

    const createExemptionButton = page.getByRole('button', {
      name: /create exemption for selected applications/i,
    })

    const rowA10012 = page.locator('#selectRow-A-10012')
    await expect(rowA10012).toBeVisible()

    await rowA10012.setChecked(true, { force: true })
    await expect(createExemptionButton).toBeEnabled()

    await createExemptionButton.click()

    await expect(page).toHaveURL(/\/provincial\/exemption\/create(?:\?.*)?$/)
    await expect(page.getByRole('heading', { name: /create provincial exemption/i })).toBeVisible()
    await expect(page.getByText(/Loaded 1 application\(s\) into this form\./i)).toBeVisible()
    await expect(page.locator('#applicationNumber')).toHaveValue('A-10012')
    await expect(page.locator('#applicantClientNumber')).toHaveValue('00011002')
    await expect(page.locator('#ownerClientNumber')).toHaveValue('00021002')
  })
})
