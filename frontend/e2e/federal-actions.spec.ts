import { expect, test } from '@playwright/test'
import { bootstrapDevRoles, gotoProtectedRoute } from './utils'

test.describe('federal application table action states', () => {
  test('create exemption requires valid selection and matching client numbers', async ({ page }) => {
    await bootstrapDevRoles(page, ['ADMIN'])
    await gotoProtectedRoute(page, '/federal')

    const createExemptionButton = page.getByRole('button', {
      name: /create exemption for selected applications/i,
    })

    await expect(createExemptionButton).toBeDisabled()

    const rowF10001 = page.locator('#selectRow-F-A-10001')
    const rowF10002 = page.locator('#selectRow-F-A-10002')
    const rowF10003 = page.locator('#selectRow-F-A-10003')

    await expect(rowF10001).toBeVisible()
    await expect(rowF10002).toBeVisible()
    await expect(rowF10003).toBeDisabled()

    await rowF10001.setChecked(true, { force: true })
    await expect(createExemptionButton).toBeEnabled()

    await rowF10002.setChecked(true, { force: true })
    await createExemptionButton.click()

    await expect(page).toHaveURL(/\/federal(?:\?.*)?$/)
    await expect(
      page.getByText(/Selected federal applications do not share the same client number\./i),
    ).toBeVisible()

    await rowF10002.setChecked(false, { force: true })
    await createExemptionButton.click()

    await expect(page).toHaveURL(/\/provincial\/exemption\/create(?:\?.*)?$/)
    await expect(page.getByRole('heading', { name: /create provincial exemption/i })).toBeVisible()
    await expect(page.getByText(/Loaded 1 application\(s\) into this form\./i)).toBeVisible()
    await expect(page.locator('#applicationNumber')).toHaveValue('F-A-10001')
    await expect(page.locator('#applicantClientNumber')).toHaveValue('00011234')
    await expect(page.locator('#ownerClientNumber')).toHaveValue('00011234')
  })
})
